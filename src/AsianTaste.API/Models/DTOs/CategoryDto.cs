namespace AsianTaste.API.Models.DTOs;

/// <summary>
/// Data transfer object for menu categories.
/// </summary>
public class CategoryDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int DisplayOrder { get; set; }
    public int ItemCount { get; set; }
    public bool IsActive { get; set; } = true;
}
