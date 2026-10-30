// Seeds 1 admin + the 6 official products. Safe to re-run:
// existing admin (by email) and products (by slug) are left untouched.
import bcrypt from 'bcrypt';
import { env } from '../src/config/env.js';
import { withTransaction, closePool } from '../src/config/db.js';
import { logger } from '../src/utils/logger.js';

const PRODUCTS = [
  {
    name: "Ubw'iwacu Honey - 350 g",
    slug: 'ubwiwacu-honey-350g',
    sku: 'UBH-350',
    short_description: 'A convenient package for discovering the sweetness of honey and enjoying it in everyday moments.',
    marketing_story:
      'Every beautiful journey begins with a small step. The 350 g package invites you to discover the sweetness of nature in a convenient size. Small in size, meaningful in every moment.',
    suggested_uses: 'Breakfast. Tea and other beverages. Home cooking. Personal use. Small gifts.',
    weight_grams: 350,
    category: 'standard',
    price_rwf: 2500,
    stock_qty: 100,
    low_stock_at: 10,
    is_featured: false,
  },
  {
    name: "Ubw'iwacu Honey - 500 g",
    slug: 'ubwiwacu-honey-500g',
    sku: 'UBH-500',
    short_description: 'A practical choice for customers who want honey readily available for everyday use.',
    marketing_story:
      "Some of life's best moments are the simplest. The 500 g package is designed for everyday routines. Make every day a little sweeter.",
    suggested_uses: 'Everyday household use. Breakfast and beverages. Cooking and recipes. Sharing with family and friends.',
    weight_grams: 500,
    category: 'standard',
    price_rwf: 4500,
    stock_qty: 100,
    low_stock_at: 10,
    is_featured: true,
  },
  {
    name: "Ubw'iwacu Honey - 1 kg",
    slug: 'ubwiwacu-honey-1kg',
    sku: 'UBH-1KG',
    short_description: 'A generous package for families and customers who regularly use honey at home.',
    marketing_story:
      'A home is built around the little things people share. The 1 kg package is for households that want a generous supply. Because sweetness is even better when shared.',
    suggested_uses: 'Family breakfasts. Everyday cooking. Tea and beverages. Frequent household use.',
    weight_grams: 1000,
    category: 'standard',
    price_rwf: 9000,
    stock_qty: 100,
    low_stock_at: 10,
    is_featured: true,
  },
  {
    name: "Ubw'iwacu Honey - 5 kg",
    slug: 'ubwiwacu-honey-5kg',
    sku: 'UBH-5KG',
    short_description: 'A bulk package for customers and businesses with higher honey requirements.',
    marketing_story:
      'The 5 kg package is designed for customers who use honey regularly. Think ahead, stock up, and keep the sweetness flowing.',
    suggested_uses: 'Larger households. Restaurants and cafes. Food preparation. Bulk purchasing.',
    weight_grams: 5000,
    category: 'standard',
    price_rwf: 45000,
    stock_qty: 50,
    low_stock_at: 5,
    is_featured: false,
  },
  {
    name: "Ubw'iwacu Honey - 7 kg",
    slug: 'ubwiwacu-honey-7kg',
    sku: 'UBH-7KG',
    short_description: 'A large-format package for customers and businesses that require substantial quantities of honey.',
    marketing_story:
      'The 7 kg package is designed for customers who need a substantial quantity for regular use. If honey is part of what you serve, think bigger.',
    suggested_uses: 'Restaurant and cafe operations. Larger kitchens. Food-service businesses. Bulk purchasing.',
    weight_grams: 7000,
    category: 'standard',
    price_rwf: 63000,
    stock_qty: 30,
    low_stock_at: 5,
    is_featured: false,
  },
  {
    name: "Ubw'iwacu Premium Honey - 1 kg",
    slug: 'ubwiwacu-premium-honey-1kg',
    sku: 'UBH-PRM-1KG',
    short_description:
      'A premium honey package for customers seeking a more elevated presentation for personal enjoyment or gifting.',
    marketing_story:
      'Some gifts are remembered not only for what they contain, but also for the thought behind them. Inspired by the beauty of Rwanda, it represents a more considered way to give, share, and enjoy.',
    suggested_uses: 'Personal gifts. Special occasions. Corporate gifting. Premium home presentation.',
    weight_grams: 1000,
    category: 'premium',
    price_rwf: 16000,
    stock_qty: 40,
    low_stock_at: 5,
    is_featured: true,
  },
];

async function seed() {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env to seed the admin');
  }
  if (env.ADMIN_PASSWORD.length < 8) throw new Error('ADMIN_PASSWORD must be at least 8 characters');

  await withTransaction(async (client) => {
    const hash = await bcrypt.hash(env.ADMIN_PASSWORD, 12);
    const admin = await client.query(
      `INSERT INTO users (name, email, password_hash, role, status)
       VALUES ($1, lower($2), $3, 'admin', 'active')
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      [env.ADMIN_NAME, env.ADMIN_EMAIL, hash],
    );
    logger.info(admin.rows.length ? `Admin created: ${env.ADMIN_EMAIL}` : `Admin already exists: ${env.ADMIN_EMAIL} (unchanged)`);

    let created = 0;
    for (const p of PRODUCTS) {
      const res = await client.query(
        `INSERT INTO products
           (name, slug, sku, short_description, marketing_story, suggested_uses, weight_grams,
            category, price_rwf, stock_qty, low_stock_at, is_available, is_featured, price_history)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,$12,
                 jsonb_build_array(jsonb_build_object('price_rwf', $9::int, 'previous_price_rwf', null,
                                                      'changed_at', now(), 'changed_by', null)))
         ON CONFLICT (slug) DO NOTHING
         RETURNING id`,
        [
          p.name, p.slug, p.sku, p.short_description, p.marketing_story, p.suggested_uses,
          p.weight_grams, p.category, p.price_rwf, p.stock_qty, p.low_stock_at, p.is_featured,
        ],
      );
      created += res.rows.length;
    }
    logger.info(`Products: ${created} created, ${PRODUCTS.length - created} already existed`);

    await client.query(
      `INSERT INTO app_meta (key, value) VALUES ('order_seq', '{"value":0}'), ('receipt_seq', '{"value":0}')
       ON CONFLICT (key) DO NOTHING`,
    );
  });
}

seed()
  .then(() => logger.info('Seed complete'))
  .catch((err) => {
    logger.error(`Seed failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => closePool());
