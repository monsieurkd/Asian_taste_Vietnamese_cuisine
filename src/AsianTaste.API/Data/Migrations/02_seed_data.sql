-- ============================================
-- Asian Taste Seed Data
-- Date: 2026-01-31
-- ============================================

-- ============================================
-- CATEGORIES
-- ============================================
INSERT INTO categories (id, name, description, display_order, is_active) VALUES
(1, 'Starters', 'Appetizers and small bites', 1, true),
(2, 'Banh Mi', 'Vietnamese Meat Rolls', 2, true),
(3, 'Noodle Soup', 'Hot noodle soups', 3, true),
(4, 'Noodle Bowl Salad', 'Fresh noodle salads', 4, true),
(5, 'Noodle Stir-Fry', 'Stir-fried noodle dishes', 5, true),
(6, 'Rice Bowl', 'Custom rice bowls with toppings', 6, true),
(7, 'Rice Dishes', 'Fried rice and rice hotpot', 7, true),
(8, 'Chicken Dishes', 'Chicken mains', 8, true),
(9, 'Pork Dishes', 'Pork mains', 9, true),
(10, 'Salt & Pepper', 'Salt & pepper dishes', 10, true),
(11, 'Beef Dishes', 'Beef mains', 11, true),
(12, 'Seafood Dishes', 'Seafood mains', 12, true),
(13, 'Vegetable Dishes', 'Vegetarian and vegan options', 13, true),
(14, 'Super Deals', 'Value combo deals', 14, true)
ON CONFLICT (id) DO NOTHING;

SELECT setval('categories_id_seq', (SELECT MAX(id) FROM categories));

-- ============================================
-- MENU ITEMS
-- ============================================
INSERT INTO menu_items (category_id, name, description, base_price, is_available, is_popular, is_gluten_free, is_vegetarian, is_vegan, spicy_level) VALUES
-- Starters
(1, 'Cold rolls (serve of 4)', 'Chicken / Prawn / Tofu / Pork', 8.50, true, false, true, false, false, 0),
(1, 'Homemade Dimsim (serve of 3)', 'Steamed or Fried - Chicken or Pork', 6.00, true, false, false, false, false, 0),
(1, 'Satay skewers (serve of 3)', 'Chicken or beef', 7.80, true, false, true, false, false, 0),
(1, 'Spring roll (serve of 3)', 'Chicken or Veg', 5.80, true, false, false, true, true, 0),
(1, 'Prawn Spring roll (serve of 3)', 'Crispy golden spring rolls filled with seasoned prawn and mixed vegetables', 6.00, true, false, false, false, false, 0),
(1, 'Homemade wonton', 'Silky rice noodles in aromatic broth with handmade pork wontons, topped with fresh herbs', 6.50, true, false, false, false, false, 0),
(1, 'Laksa soup', 'Chicken or Veg', 7.80, true, false, true, false, true, 0),
(1, 'Sweet corn soup', 'Creamy sweet corn soup with egg drops, choose chicken or vegetarian', 7.80, true, false, true, false, true, 0),

-- Banh Mi
(2, 'Tofu Banh Mi', 'Crispy baguette with seasoned tofu, pickled vegetables, fresh cilantro, and house sauce', 8.00, true, false, false, true, true, 0),
(2, 'Red Pork Banh Mi', 'Crispy baguette with Vietnamese red pork, pickled vegetables, fresh cilantro, and house sauce', 8.00, true, false, false, false, false, 0),
(2, 'Grilled Chicken Banh Mi', 'Crispy baguette with grilled chicken, pickled vegetables, fresh cilantro, and house sauce', 8.20, true, false, false, false, false, 0),
(2, 'Lemongrass Chicken Banh Mi', 'Crispy baguette with lemongrass chicken, pickled vegetables, fresh cilantro, and house sauce', 8.50, true, false, false, false, false, 0),
(2, 'Crispy Pork (Roasted Pork) Banh Mi', 'Crispy baguette with roasted crispy pork belly, pickled vegetables, fresh cilantro, and house sauce', 8.50, true, true, false, false, false, 0),
(2, 'Satay Chicken Banh Mi', 'Crispy baguette with satay chicken, pickled vegetables, fresh cilantro, and spicy peanut sauce', 8.50, true, false, false, false, false, 0),
(2, 'Lemongrass Beef Banh Mi', 'Crispy baguette with lemongrass beef, pickled vegetables, fresh cilantro, and house sauce', 8.50, true, false, false, false, false, 0),
(2, 'Combination Banh Mi', 'Crispy baguette with combination of meats, pickled vegetables, fresh cilantro, and house sauce', 9.00, true, true, false, false, false, 0),

-- Noodle Soup
(3, 'Pho - Beef noodle soup (1 choice)', 'Rare beef / Brisket / beef ball', 15.50, true, true, true, false, false, 0),
(3, 'Pho - Beef noodle soup (Combo)', 'Rare beef / Brisket / beef ball', 16.50, true, true, true, false, false, 0),
(3, 'Spicy beef noodle soup', 'Combo', 16.50, true, false, true, false, false, 3),
(3, 'Chicken noodle soup', 'Grilled / Steamed Chicken', 15.50, true, false, true, false, false, 0),
(3, 'Wonton noodle soup', NULL, 15.50, true, false, true, false, false, 0),
(3, 'Laksa noodle soup - Vegan', 'Rich and creamy coconut curry broth with rice noodles, tofu, and fresh vegetables', 15.50, true, false, true, false, true, 2),
(3, 'Laksa noodle soup - Chicken', 'Spicy coconut curry broth with rice noodles, chicken, and fresh herbs', 16.50, true, false, true, false, false, 2),
(3, 'Laksa noodle soup - Crispy pork', 'Spicy coconut curry broth with rice noodles, crispy pork, and fresh herbs', 16.50, true, false, true, false, false, 2),
(3, 'Laksa noodle soup - Seafood', 'Spicy coconut curry broth with rice noodles, seafood, and fresh herbs', 17.00, true, false, true, false, false, 2),
(3, 'Laksa noodle soup - Combination', 'Spicy coconut curry broth with rice noodles, mixed meats, and fresh herbs', 17.50, true, false, true, false, false, 2),

-- Noodle Bowl Salad
(4, 'Tofu Noodle Bowl Salad', 'Crispy / Lemongrass', 15.00, true, false, true, true, true, 0),
(4, 'Spring rolls Noodle Bowl Salad', 'Chicken / Veg', 15.00, true, false, false, true, true, 0),
(4, 'Chicken Noodle Bowl Salad', 'Grilled / lemongrass / Spicy', 15.20, true, false, true, false, false, 0),
(4, 'Crispy Pork Noodle Bowl Salad', 'Fresh rice noodle salad with crispy pork, fresh herbs, pickled vegetables, and nuoc cham dressing', 15.50, true, false, true, false, false, 0),
(4, 'Beef Noodle Bowl Salad', 'Lemongrass / soy-pepper', 15.50, true, false, true, false, false, 0),
(4, 'Combination Noodle Bowl Salad', 'Fresh rice noodle salad with combination of meats, fresh herbs, and tangy nuoc cham dressing', 16.20, true, false, false, false, false, 0),

-- Noodle Stir-Fry
(5, 'Pad Thai', 'Chicken / Veg / Prawn', 16.00, true, true, false, false, true, 0),
(5, 'Singapore noodle', 'Chicken / Prawn / Veg', 16.00, true, false, false, false, true, 0),
(5, 'Mongolian noodle', 'Chicken / Beef / Veg - Hokkien / Rice noodle', 16.00, true, false, false, false, true, 0),
(5, 'Korean Glass Noodle (Low carb)', 'Veg / Beef / Prawn', 16.00, true, false, true, false, true, 0),
(5, 'Wok-tossed soft egg noodle - Vegan', 'Stir-fried egg noodles with your choice of protein and fresh vegetables in savory sauce', 16.80, true, false, true, false, true, 0),
(5, 'Wok-tossed soft egg noodle - Chicken / Beef', 'Stir-fried egg noodles with chicken or beef, mixed vegetables, and savory sauce', 17.80, true, false, true, false, false, 0),
(5, 'Wok-tossed soft egg noodle - Seafood', 'Stir-fried egg noodles with seafood, mixed vegetables, and savory sauce', 19.20, true, false, true, false, false, 0),
(5, 'Wok-tossed soft egg noodle - Combo', 'Stir-fried egg noodles with combination of meats, seafood, and fresh vegetables', 19.50, true, false, false, false, false, 0),

-- Rice Bowl
(6, 'Rice Bowl - Lemongrass Tofu', 'Fluffy rice bowl with lemongrass tofu, fresh vegetables, and savory sauce', 14.50, true, false, true, true, true, 0),
(6, 'Rice Bowl - Crispy Chicken or Pork', 'Fluffy rice bowl with crispy chicken or pork, fresh vegetables, and savory sauce', 14.80, true, false, false, false, false, 0),
(6, 'Rice Bowl - Satay Chicken', 'Fluffy rice bowl with satay chicken, fresh vegetables, and peanut sauce', 14.80, true, false, false, false, false, 0),
(6, 'Rice Bowl - Spicy chicken', 'Fluffy rice bowl with spicy chicken, fresh vegetables, and chili sauce', 14.80, true, false, false, false, false, 2),
(6, 'Rice Bowl - Garlic butter chicken', 'Fluffy rice bowl with garlic butter chicken, fresh vegetables, and aromatic sauce', 14.80, true, false, true, false, false, 0),
(6, 'Rice Bowl - Soy-pepper Beef', 'Fluffy rice bowl with soy-pepper beef, fresh vegetables, and savory sauce', 14.80, true, false, true, false, false, 0),
(6, 'Rice Bowl - Sunny egg & Crispy pork', 'Fluffy rice bowl with sunny side egg, crispy pork, and savory sauce', 15.80, true, false, false, false, false, 0),
(6, 'Rice Bowl - Curry (Green/Yellow)', 'Chicken / beef / Veg', 16.00, true, false, true, false, true, 1),

-- Rice Dishes
(7, 'Steamed rice', 'Fluffy steamed jasmine rice, perfect side dish for any main course', 2.00, true, false, true, true, true, 0),
(7, 'Fried rice', 'Stir-fried rice with eggs, mixed vegetables, and savory seasonings', 11.50, true, false, true, true, true, 0),
(7, 'Spicy basil fried rice', 'Stir-fried rice with spicy basil, chilies, mixed vegetables, and savory sauce', 12.50, true, false, true, false, true, 2),
(7, 'Japanese fried rice', 'Stir-fried rice with Japanese seasonings, egg, and mixed vegetables', 12.50, true, false, false, false, false, 0),
(7, 'Asian taste rice hotpot', 'Asian-style rice hotpot with your choice of protein, vegetables, and savory sauce in clay pot', 17.90, true, false, false, false, false, 0),

-- Chicken Dishes
(8, 'Mix veg cashew nut (Chicken)', 'Stir-fried chicken with mixed vegetables and cashew nuts in savory sauce', 19.00, true, false, false, false, false, 0),
(8, 'Mix veg in creamy satay sauce (Chicken)', 'Stir-fried chicken with mixed vegetables in creamy satay peanut sauce', 19.00, true, false, true, false, false, 0),
(8, 'Mix veg in Malaysian curry (Chicken)', 'Stir-fried chicken with mixed vegetables in aromatic Malaysian curry sauce', 19.00, true, false, true, false, false, 1),
(8, 'Mix veg with spicy chilli basil (Chicken)', 'Stir-fried chicken with mixed vegetables, chili, and spicy basil sauce', 19.00, true, false, true, false, false, 3),
(8, 'Honey Chicken', 'Crispy chicken pieces in sweet honey glaze with steamed vegetables', 18.00, true, true, true, false, false, 0),
(8, 'Mix veg in Thai green curry (Chicken)', 'Stir-fried chicken with mixed vegetables in Thai green curry sauce', 19.00, true, false, false, false, false, 2),

-- Pork Dishes
(9, 'Vietnamese crispy pork', 'Crispy Vietnamese pork belly with steamed rice and vegetables', 18.50, true, false, false, false, false, 0),
(9, 'Sweet & Sour pork', 'Crispy pork pieces in sweet and sour sauce with pineapple and vegetables', 18.50, true, false, false, false, false, 0),

-- Salt & Pepper
(10, 'Salt & Pepper Tofu', 'Crispy salt and pepper tofu with chili, peppers, and onions', 16.50, true, false, true, true, true, 0),
(10, 'Salt & Pepper Chicken', 'Crispy salt and pepper chicken with chili, peppers, and onions', 18.00, true, false, true, false, false, 0),
(10, 'Salt & Pepper Squid / Fish', 'Crispy salt and pepper squid or fish with chili, peppers, and onions', 18.50, true, false, true, false, false, 0),
(10, 'Salt & Pepper Prawn', 'Crispy salt and pepper prawn with chili, peppers, and onions', 19.80, true, false, true, false, false, 0),
(10, 'Salt & Pepper Combination', 'Crispy salt and pepper combination of seafood and meats with chili and peppers', 21.50, true, false, true, false, false, 0),

-- Beef Dishes
(11, 'Mix veg in cashew nut (Beef)', 'Stir-fried beef with mixed vegetables and cashew nuts in savory sauce', 19.80, true, false, false, false, false, 0),
(11, 'Mix veg in black bean sauce (Beef)', 'Stir-fried beef with mixed vegetables in rich black bean sauce', 19.80, true, false, true, false, false, 0),
(11, 'Mix veg in Mongolian sauce (Beef)', 'Stir-fried beef with mixed vegetables in savory Mongolian sauce', 19.80, true, false, true, false, false, 0),
(11, 'Mix veg with spicy chilli basil (Beef)', 'Stir-fried beef with mixed vegetables, chili, and spicy basil sauce', 19.80, true, false, true, false, false, 3),
(11, 'Mix veg with black pepper (Beef)', 'Stir-fried beef with mixed vegetables in black pepper sauce', 19.80, true, false, false, false, false, 2),

-- Seafood Dishes
(12, 'Combo seafood ginger hotpot', 'Combination seafood in ginger hotpot with mixed vegetables and aromatic broth', 20.80, true, false, false, false, false, 0),
(12, 'Prawn hotpot in Asian spices', 'Prawn hotpot with Asian spices, mixed vegetables, and flavorful broth', 20.80, true, false, true, false, false, 0),
(12, 'Creamy garlic prawn', 'Creamy garlic prawn with mixed vegetables in rich garlic sauce', 20.80, true, false, false, false, false, 0),
(12, 'Prawn curry (Green/Yellow)', 'Prawn curry in green or yellow curry sauce with vegetables', 20.80, true, false, true, false, false, 2),

-- Vegetable Dishes
(13, 'Mix veg cashew nut', 'Stir-fried mixed vegetables with cashew nuts in savory sauce', 15.00, true, false, true, true, true, 0),
(13, 'Green bean in soy and garlic', 'Stir-fried green beans with soy sauce and garlic', 15.50, true, false, true, true, true, 0),
(13, 'Veg tofu hotpot', 'Vegetable tofu hotpot with mixed vegetables in savory broth', 16.50, true, false, true, true, true, 0),
(13, 'Tofu chilli lemongrass', 'Stir-fried tofu with chili and lemongrass in aromatic sauce', 15.00, true, false, true, true, true, 0),
(13, 'Steamed bokchoy in oyster garlic sauce', 'Steamed bok choy with oyster garlic sauce', 15.00, true, false, true, true, true, 0),
(13, 'Vegan curry (Green/Yellow)', NULL, 16.50, true, false, true, false, true, 1),

-- Super Deals
(14, 'Snack Super Deal', '2 spring rolls + 1 drink', 5.20, true, true, false, true, true, 0);

SELECT setval('menu_items_id_seq', (SELECT MAX(id) FROM menu_items));
