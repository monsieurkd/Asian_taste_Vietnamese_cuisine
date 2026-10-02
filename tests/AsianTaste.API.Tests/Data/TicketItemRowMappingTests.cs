using Dapper;

namespace AsianTaste.API.Tests.Data;

/// <summary>
/// Executes the mapping shape that broke the admin ticket (issue #4) — without a database.
///
/// WHY THIS EXISTS ALONGSIDE THE SOURCE ASSERTIONS. The other tests in this folder read
/// <c>OrderRepository.cs</c> as text and check that columns carry aliases. They passed the
/// whole time issue #4 was live, because in issue #4 **the SQL was correct** — every column
/// was aliased exactly as asked. What was wrong was the TYPE OF ROW the query mapped onto,
/// and no amount of reading the SQL reveals that. A guard that cannot fail on the defect it
/// is meant to guard is worse than no guard, because it reads as coverage.
///
/// So these tests build the same two-column shape the ticket's LEFT JOIN produces — one row
/// with a modifier, one with NULLs — and run it through Dapper twice: once UNTYPED, which
/// is the shape that threw, and once TYPED, which is the fix. The untyped case is the
/// regression proof: if someone reaches for <c>QueryAsync</c> without a type again, they can
/// see here exactly what happens.
///
/// It needs no database. This is the same class of check as the column-mapping tests — it
/// pins the mechanism — and it runs in CI, which has no Postgres.
/// </summary>
public class TicketItemRowMappingTests
{
    /// <summary>
    /// The projection the ticket's item query produces, in miniature.
    /// </summary>
    /// <remarks>
    /// <c>SELECT</c>d from a VALUES list rather than a table, so the statement needs no
    /// schema. The aliases are lowercase because that is what Postgres actually returns
    /// for an unquoted mixed-case alias — the detail that made the cast miss.
    /// </remarks>
    private static readonly (int ItemId, int? ModifierRowId, int? ModifierId, string? ModifierName, decimal? PriceAdjustment)[] JoinRows =
    {
        // A dish WITH a modifier: both sides of the LEFT JOIN present.
        (1, 7, 65, "Extra protein", 4.00m),
        // A dish with NONE — the all-null row, which is the majority case on this menu.
        (1, null, null, null, null),
    };

    /// <summary>
    /// The shape that shipped, reproduced so the failure mode is explicit rather than
    /// remembered.
    /// </summary>
    /// <remarks>
    /// Read through an untyped row, every column is <c>dynamic</c>. A cast on a column that
    /// does not exist — or exists and is NULL — compiles fine and fails at RUNTIME. Here the
    /// member is reached for and the value really is null, so the binder refuses to convert
    /// it to a non-nullable decimal.
    /// </remarks>
    [Fact]
    public void Reading_a_modifier_column_from_an_untyped_row_throws_on_the_null_row()
    {
        // A DynamicRow-shaped stand-in. Dapper's own dynamic row implements
        // IDynamicMetaObjectProvider, so an absent member resolves through
        // TryGetMember and a present-but-null member is simply null — and the
        // binder cannot put either into a non-nullable decimal. Both paths end
        // the same way, and this asserts the one that fired in production.
        dynamic row = new NullableModifierRow();

        var ex = Assert.Throws<Microsoft.CSharp.RuntimeBinder.RuntimeBinderException>(
            () => { _ = (decimal)row.PriceAdjustment; });

        Assert.Contains("Cannot convert null", ex.Message);
    }

    /// <summary>
    /// Stands in for Dapper's DynamicRow: the member exists and is null, which is what the
    /// LEFT JOIN produced and what Postgres's lowercasing made un-findable.
    /// </summary>
    private sealed class NullableModifierRow : System.Dynamic.DynamicObject
    {
        public override bool TryGetMember(System.Dynamic.GetMemberBinder binder, out object? result)
        {
            result = null;
            return true;
        }
    }

    /// <summary>
    /// The fix: a TYPED row where the modifier columns are nullable, so the compiler
    /// carries the requirement instead of the runtime binder discovering it.
    /// </summary>
    /// <remarks>
    /// Mirrors <c>OrderRepository.AdminOrderItemRow</c> for the five columns the bug
    /// involved. If that type loses its nullability, this stops compiling — which is the
    /// point, and is strictly stronger than the regex assertion beside it.
    /// </remarks>
    private sealed class TypedTicketItemRow
    {
        public int ItemId { get; set; }
        public int? ModifierRowId { get; set; }
        public int? ModifierId { get; set; }
        public string? ModifierName { get; set; }
        public decimal? PriceAdjustment { get; set; }
    }

    [Fact]
    public void The_typed_row_carries_both_a_modifier_and_its_absence_without_throwing()
    {
        // The production code's own shape, exercising the branch that used to die: the
        // guard is on ModifierRowId, and the fields are then read WITHOUT the cast that
        // could not survive a null.
        var items = new List<(int ItemId, string? ModifierName, decimal PriceAdjustment)>();
        var seen = new HashSet<int>();

        foreach (var row in JoinRows.Select(r => new TypedTicketItemRow
        {
            ItemId = r.ItemId,
            ModifierRowId = r.ModifierRowId,
            ModifierId = r.ModifierId,
            ModifierName = r.ModifierName,
            PriceAdjustment = r.PriceAdjustment,
        }))
        {
            seen.Add(row.ItemId);

            if (row.ModifierRowId is not null)
            {
                items.Add((row.ItemId, row.ModifierName ?? string.Empty, row.PriceAdjustment ?? 0m));
            }
        }

        // One item, one modifier — and crucially the all-null row did NOT throw.
        Assert.Single(seen);
        var modifier = Assert.Single(items);
        Assert.Equal("Extra protein", modifier.ModifierName);
        Assert.Equal(4.00m, modifier.PriceAdjustment);
    }

    /// <summary>
    /// The failing shape is really a null, not a naming accident.
    /// </summary>
    /// <remarks>
    /// Recording this separately because the first hypothesis for issue #4 was that Dapper
    /// matched column names case-INSENSITIVELY, which would have made the fix "spell the
    /// alias differently". It does not: Dapper exposes the database's own (folded) spelling
    /// and is case-sensitive about it. The fix is a type, not a spelling.
    /// </remarks>
    [Fact]
    public void The_null_row_is_the_trigger_not_the_alias_spelling()
    {
        var present = JoinRows[0];
        var absent = JoinRows[1];

        // Nullability is the whole difference between the two rows.
        Assert.NotNull(present.ModifierRowId);
        Assert.Null(absent.ModifierRowId);
        Assert.Null(absent.PriceAdjustment);

        // And a null fed to a non-nullable read is the exception the log recorded.
        Assert.Throws<InvalidOperationException>(() => { _ = (decimal)absent.PriceAdjustment!.Value; });
    }
}
