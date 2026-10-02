using AsianTaste.API.Controllers;
using AsianTaste.API.Models.DTOs;
using AsianTaste.API.Repositories;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;

namespace AsianTaste.API.Tests.Controllers;

/// <summary>
/// Tests that the admin menu writes actually WRITE.
///
/// Regression context, found 2026-09-25 while wiring the menu-editing UI: every write
/// endpoint on <c>AdminMenuController</c> was a stub. Ten of them logged a line like
/// "Updating menu item 12" and returned <c>204 No Content</c> without touching the
/// database — the repository had no write methods at all.
///
/// The dangerous part is the shape of the failure. A 204 IS the success response, so:
///
///   - the console's "mark unavailable" switch flipped in the UI and reported success
///     while the dish stayed on sale — a customer could order what the kitchen had run
///     out of;
///   - a price change appeared to save and did not, which the owner would discover from
///     a customer rather than from the app.
///
/// A test that asserted "the endpoint returns 204" would have PASSED the whole time.
/// These assert on the collaborator — that the write was requested, with the values
/// the caller sent — because that is the property that was missing. Same reasoning as
/// OrderServicePaymentTests, for the same reason.
/// </summary>
public class AdminMenuWriteTests
{
    private static AdminMenuController CreateController(RecordingMenuRepository repo) =>
        new(repo, NullLogger<AdminMenuController>.Instance);

    // ── Availability: the switch the console already ships ───────────────────

    [Fact]
    public async Task Marking_a_dish_unavailable_actually_writes_it()
    {
        var repo = new RecordingMenuRepository();
        var controller = CreateController(repo);

        var result = await controller.ToggleItemAvailability(
            7, new ToggleAvailabilityDto { IsActive = false }, CancellationToken.None);

        Assert.IsType<OkObjectResult>(result);

        // The assertion that matters: the repository was ASKED, with the right value.
        // The old stub returned 204 and this list stayed empty.
        var write = Assert.Single(repo.AvailabilityWrites);
        Assert.Equal(7, write.Id);
        Assert.False(write.IsAvailable);
    }

    [Fact]
    public async Task Bringing_a_dish_back_writes_the_true_value()
    {
        // The mirror case: a dish restocked mid-service goes back on the menu. An
        // implementation that hardcoded `false` would pass the test above and fail here.
        var repo = new RecordingMenuRepository();
        var controller = CreateController(repo);

        await controller.ToggleItemAvailability(
            7, new ToggleAvailabilityDto { IsActive = true }, CancellationToken.None);

        Assert.True(Assert.Single(repo.AvailabilityWrites).IsAvailable);
    }

    [Fact]
    public async Task A_dish_that_does_not_exist_reports_not_found_rather_than_success()
    {
        var repo = new RecordingMenuRepository { ItemExists = false };
        var controller = CreateController(repo);

        var result = await controller.ToggleItemAvailability(
            999, new ToggleAvailabilityDto { IsActive = false }, CancellationToken.None);

        Assert.IsType<NotFoundObjectResult>(result);
        Assert.Empty(repo.AvailabilityWrites);
    }

    // ── Editing a dish ───────────────────────────────────────────────────────

    [Fact]
    public async Task A_price_change_is_written()
    {
        var repo = new RecordingMenuRepository();
        var controller = CreateController(repo);

        var result = await controller.UpdateMenuItem(
            12, new UpdateMenuItemDto { Price = 13.50m }, CancellationToken.None);

        Assert.IsType<OkObjectResult>(result);

        var update = Assert.Single(repo.ItemUpdates);
        Assert.Equal(12, update.Id);
        Assert.Equal(13.50m, update.Update.BasePrice);
    }

    [Fact]
    public async Task Only_the_fields_that_were_sent_are_included()
    {
        // The rule that makes a partial edit safe. If the controller filled every DTO
        // field into the update, editing a price would blank the description and the
        // dietary flags — the menu would lose data during an unrelated change.
        var repo = new RecordingMenuRepository();
        var controller = CreateController(repo);

        await controller.UpdateMenuItem(12, new UpdateMenuItemDto { Price = 13.50m }, CancellationToken.None);

        var update = Assert.Single(repo.ItemUpdates).Update;
        Assert.Equal(13.50m, update.BasePrice);
        Assert.Null(update.Name);
        Assert.Null(update.Description);
        Assert.Null(update.ImageUrl);
        Assert.Null(update.IsVegetarian);
    }

    [Fact]
    public async Task Renaming_a_dish_is_written()
    {
        var repo = new RecordingMenuRepository();
        var controller = CreateController(repo);

        await controller.UpdateMenuItem(12, new UpdateMenuItemDto { Name = "Pho Dac Biet" }, CancellationToken.None);

        Assert.Equal("Pho Dac Biet", Assert.Single(repo.ItemUpdates).Update.Name);
    }

    [Fact]
    public async Task Returning_the_updated_dish_rather_than_the_request()
    {
        // The console renders what comes back, so the response must be the STORED row.
        // Echoing the request would show the owner their own edit whether or not it
        // landed — which is exactly how the silent no-op stayed invisible.
        var repo = new RecordingMenuRepository
        {
            StoredItem = new MenuItemDetailDto { Id = 12, Name = "Stored Name", Price = 99.00m },
        };
        var controller = CreateController(repo);

        var result = await controller.UpdateMenuItem(
            12, new UpdateMenuItemDto { Name = "Typed Name" }, CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result);
        var body = Assert.IsType<MenuItemDetailDto>(ok.Value);
        Assert.Equal("Stored Name", body.Name);
        Assert.Equal(99.00m, body.Price);
    }

    [Fact]
    public async Task A_dish_that_does_not_exist_reports_not_found()
    {
        var repo = new RecordingMenuRepository { ItemExists = false };
        var controller = CreateController(repo);

        var result = await controller.UpdateMenuItem(
            999, new UpdateMenuItemDto { Price = 5m }, CancellationToken.None);

        Assert.IsType<NotFoundObjectResult>(result);
        Assert.Empty(repo.ItemUpdates);
    }

    [Fact]
    public async Task An_update_that_does_not_land_reports_failure()
    {
        // The write returns null when the row is gone, or when the category it names
        // does not exist. Both mean "this edit did not happen", and a 200 there would
        // be the same lie the stub told.
        var repo = new RecordingMenuRepository { UpdateReturnsNull = true };
        var controller = CreateController(repo);

        var result = await controller.UpdateMenuItem(
            12, new UpdateMenuItemDto { Price = 5m }, CancellationToken.None);

        Assert.IsType<NotFoundObjectResult>(result);
    }

    // ── Validation ───────────────────────────────────────────────────────────

    [Theory]
    [InlineData(-1)]
    [InlineData(-0.01)]
    public async Task A_negative_price_is_refused(decimal price)
    {
        var repo = new RecordingMenuRepository();
        var controller = CreateController(repo);

        var result = await controller.UpdateMenuItem(
            12, new UpdateMenuItemDto { Price = price }, CancellationToken.None);

        Assert.IsType<BadRequestObjectResult>(result);
        Assert.Empty(repo.ItemUpdates);
    }

    [Fact]
    public async Task A_blank_name_is_refused()
    {
        // Renaming a dish to nothing would leave a nameless row on the printed menu's
        // digital twin, which is worse than refusing the edit.
        var repo = new RecordingMenuRepository();
        var controller = CreateController(repo);

        var result = await controller.UpdateMenuItem(
            12, new UpdateMenuItemDto { Name = "   " }, CancellationToken.None);

        Assert.IsType<BadRequestObjectResult>(result);
        Assert.Empty(repo.ItemUpdates);
    }

    [Fact]
    public async Task A_nonsense_category_is_refused()
    {
        var repo = new RecordingMenuRepository();
        var controller = CreateController(repo);

        var result = await controller.UpdateMenuItem(
            12, new UpdateMenuItemDto { CategoryId = 0 }, CancellationToken.None);

        Assert.IsType<BadRequestObjectResult>(result);
        Assert.Empty(repo.ItemUpdates);
    }

    // ── Collaborator ─────────────────────────────────────────────────────────

    /// <summary>
    /// Records what it was asked to write, so an assertion can be made about the WRITE
    /// rather than about the HTTP status. That distinction is the whole point: a stub
    /// returning 204 satisfied every status-based test.
    /// </summary>
    private sealed class RecordingMenuRepository : IMenuRepository
    {
        public List<(int Id, bool IsAvailable)> AvailabilityWrites { get; } = [];
        public List<(int Id, MenuItemUpdate Update)> ItemUpdates { get; } = [];

        public bool ItemExists { get; set; } = true;
        public bool UpdateReturnsNull { get; set; }
        public MenuItemDetailDto? StoredItem { get; set; } = new() { Id = 12, Name = "Existing" };

        public Task<bool> SetItemAvailabilityAsync(int id, bool isAvailable, CancellationToken cancellationToken = default)
        {
            if (!ItemExists) return Task.FromResult(false);
            AvailabilityWrites.Add((id, isAvailable));
            return Task.FromResult(true);
        }

        public Task<MenuItemDetailDto?> UpdateItemAsync(int id, MenuItemUpdate update, CancellationToken cancellationToken = default)
        {
            ItemUpdates.Add((id, update));
            if (!ItemExists || UpdateReturnsNull) return Task.FromResult<MenuItemDetailDto?>(null);
            return Task.FromResult(StoredItem);
        }

        public Task<Dictionary<int, (string Name, decimal Price)>> GetPricesForItemsAsync(IReadOnlyCollection<int> menuItemIds, CancellationToken cancellationToken = default) => Task.FromResult(new Dictionary<int, (string, decimal)>());


        // Reads: only GetItemByIdAsync is reached by the endpoints under test.
        public Task<MenuItemDetailDto?> GetItemByIdAsync(int id, CancellationToken cancellationToken = default) =>
            Task.FromResult(ItemExists ? StoredItem : null);

        public Task<MenuResponseDto> GetFullMenuAsync(CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<List<CategoryDto>> GetCategoriesAsync(CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<List<MenuItemSummaryDto>> GetItemsByCategoryAsync(int categoryId, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<List<MenuItemSummaryDto>> SearchItemsAsync(string query, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<List<MenuItemSummaryDto>> SearchItemsAdvancedAsync(SearchParametersDto parameters, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<List<MenuItemSummaryDto>> GetPopularItemsAsync(CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<List<MenuItemSummaryDto>> GetAvailableItemsAsync(CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<List<MenuItemDetailDto>> GetCounterMenuAsync(CancellationToken cancellationToken = default) => throw new NotImplementedException();
    }
}
