import { test, expect } from '@playwright/test';

test.describe('Checkout Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to menu page
    await page.goto('/menu');
  });

  test('complete checkout with card payment', async ({ page }) => {
    // Add item to cart
    await page.click('[data-testid="menu-item-1"]'); // First menu item
    await page.click('button:has-text("Add to Cart")');

    // Navigate to cart
    await page.click('[data-testid="cart-icon"]');
    await expect(page).toHaveURL(/\/cart/);

    // Proceed to checkout
    await page.click('button:has-text("Checkout")');
    await expect(page).toHaveURL(/\/checkout/);

    // Fill customer information
    await page.fill('[name="name"]', 'John Doe');
    await page.fill('[name="phone"]', '555-1234');
    await page.fill('[name="email"]', 'john@example.com');

    // Continue to payment step
    await page.click('button:has-text("Continue")');
    await expect(page.locator('text=Select Payment Method')).toBeVisible();

    // Select card payment
    await page.click('[data-testid="payment-method-card"]');

    // Submit order
    await page.click('button:has-text("Place Order")');

    // Verify confirmation page
    await expect(page).toHaveURL(/\/confirmation/);
    await expect(page.locator('.confirmation-page')).toBeVisible();
  });

  test('complete checkout with cash payment', async ({ page }) => {
    // Add item to cart
    await page.click('[data-testid="menu-item-1"]');
    await page.click('button:has-text("Add to Cart")');

    // Navigate to checkout
    await page.click('[data-testid="cart-icon"]');
    await page.click('button:has-text("Checkout")');

    // Fill customer information
    await page.fill('[name="name"]', 'Jane Doe');
    await page.fill('[name="phone"]', '555-5678');
    await page.fill('[name="email"]', 'jane@example.com');
    await page.click('button:has-text("Continue")');

    // Select cash payment
    await page.click('[data-testid="payment-method-cash"]');

    // Submit order
    await page.click('button:has-text("Place Order")');

    // Verify confirmation with cash payment message
    await expect(page).toHaveURL(/\/confirmation/);
    await expect(page.locator('text=Cash on Pickup')).toBeVisible();
  });

  test('validates required fields', async ({ page }) => {
    // Navigate to checkout directly
    await page.goto('/checkout');

    // Try to continue without filling form
    await page.click('button:has-text("Continue")');

    // Verify validation errors
    await expect(page.locator('text=required')).toBeVisible();
  });

  test('displays order summary correctly', async ({ page }) => {
    // Add item to cart
    await page.click('[data-testid="menu-item-1"]');
    await page.click('button:has-text("Add to Cart")');

    // Navigate to checkout
    await page.click('[data-testid="cart-icon"]');

    // Verify order summary is visible
    await page.click('button:has-text("Checkout")');
    await expect(page.locator('.order-summary')).toBeVisible();
  });
});

test.describe('Confirmation Page', () => {
  test('displays order details after confirmation', async ({ page }) => {
    // This test assumes an order has been placed
    // Navigate to a test order confirmation
    await page.goto('/confirmation/AT-TEST001');

    // Verify order details are displayed
    await expect(page.locator('text=Order Number')).toBeVisible();
    await expect(page.locator('text=Order Status')).toBeVisible();
    await expect(page.locator('text=Payment')).toBeVisible();
  });

  test('shows loading state while fetching order', async ({ page }) => {
    // Navigate to confirmation without order
    await page.goto('/confirmation');

    // Should redirect or show loading
    await expect(page).toHaveURL(/\/menu/);
  });
});
