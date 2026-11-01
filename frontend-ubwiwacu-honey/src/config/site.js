// Official business information (spec Part 2). Do not add details that are not confirmed.
export const SITE = {
  name: "Ubw'iwacu Honey",
  parent: 'IBAKWE Business Group',
  slogan: 'Purely Ours. Truly Rwanda.',
  tagline: 'From hive to your door.',
  philosophy: 'We do not produce honey; we are porters of nature.',
  email: 'ubwiwacuhoney250@gmail.com',
  phone: '+250780737320',
  phoneDisplay: '+250 780 737 320',
  whatsapp: '250780737320',
  orderingHours: 'Ordering from 7:00 AM',
  // Spec lists the handle as "@ubw'iwacu_honey". Apostrophes are not allowed in handles,
  // so the links use "ubwiwacu_honey". Confirm the exact handle with the business.
  instagram: { handle: "@ubw'iwacu_honey", url: 'https://www.instagram.com/ubwiwacu_honey/' },
  tiktok: { handle: "@ubw'iwacu_honey", url: 'https://www.tiktok.com/@ubwiwacu_honey' },
  url: typeof window !== 'undefined' ? window.location.origin : '',
}

export const DELIVERY_NOTICE =
  "Delivery is not included in the product price. Customers are responsible for arranging and paying for delivery. Please confirm your delivery arrangements with Ubw'iwacu Honey before completing your order."

export const PAYMENT_SAFETY =
  "Ubw'iwacu Honey will never ask for your Mobile Money PIN, bank password or card details."

export const NAV = [
  { to: '/', label: 'Home' },
  { to: '/shop', label: 'Shop' },
  { to: '/our-story', label: 'Our Story' },
  { to: '/business', label: 'Business & Wholesale' },
  { to: '/contact', label: 'Contact' },
]

export const PAYMENT_METHODS = [
  { value: 'mtn_momo', label: 'MTN Mobile Money', short: 'MTN MoMo' },
  { value: 'airtel', label: 'Airtel Money', short: 'Airtel' },
  { value: 'bank', label: 'Bank transfer', short: 'Bank' },
]

export const PAYMENT_LABELS = {
  mtn_momo: 'MTN Mobile Money',
  airtel: 'Airtel Money',
  bank: 'Bank transfer',
  cash: 'Cash',
  gateway: 'Online payment',
}

/**
 * Marketing copy per product (spec Part 3), keyed by product slug.
 * Prices, stock and names always come from the API; this only adds the story.
 */
export const PRODUCT_COPY = {
  'ubwiwacu-honey-350g': {
    marketingName: 'The Little Taste of Nature',
    story: [
      'Every beautiful journey begins with a small step.',
      "The 350 g Ubw'iwacu Honey package invites you to discover the sweetness of nature in a convenient size. Whether you are enjoying breakfast, preparing a warm cup of tea, or looking for a thoughtful little gift, this package makes it easy to bring honey into your day.",
      'Small in size, meaningful in every moment.',
    ],
    uses: ['Breakfast', 'Tea and other beverages', 'Home cooking', 'Personal use', 'Small gifts'],
    idealFor: 'First-time customers, individuals, small households, and customers who prefer a smaller package.',
    cta: 'Start Small. Taste the Difference.',
  },
  'ubwiwacu-honey-500g': {
    marketingName: 'Your Everyday Sweetness',
    story: [
      "Some of life's best moments are the simplest: breakfast shared with family, a warm cup of tea, or a meal prepared with care.",
      "The 500 g Ubw'iwacu Honey package is designed for customers who want a convenient supply of honey for their everyday routines.",
      'Keep it in your kitchen, share it with someone you love, and let little moments become memorable.',
    ],
    uses: ['Everyday household use', 'Breakfast and beverages', 'Cooking and recipes', 'Sharing with family and friends', 'A modest, thoughtful gift'],
    idealFor: 'Individuals, couples, small families, and regular honey users.',
    cta: 'Make Every Day a Little Sweeter.',
  },
  'ubwiwacu-honey-1kg': {
    marketingName: 'The Family Favourite',
    story: [
      'A home is built around the little things people share.',
      'From breakfast around the table to recipes prepared for the people who matter most, food has a way of bringing everyone together.',
      "The 1 kg Ubw'iwacu Honey package is for households that want a generous supply of honey in their kitchen. It is also a practical option for frequent honey users who prefer purchasing a larger quantity at once.",
      'Because sweetness is even better when it is shared.',
    ],
    uses: ['Family breakfasts', 'Everyday cooking', 'Tea and beverages', 'Frequent household use', 'Sharing with family and friends'],
    idealFor: 'Families, frequent honey consumers, and customers who prefer larger household packages.',
    cta: 'Bring Home More Sweetness.',
  },
  'ubwiwacu-honey-5kg': {
    marketingName: 'The Smart Stock-Up',
    story: [
      'When something becomes part of your routine, having a larger supply available can make planning easier.',
      "The 5 kg Ubw'iwacu Honey package is designed for customers who use honey regularly and prefer to purchase a substantial quantity at once.",
      'Whether you manage a busy kitchen, prepare meals for a large household, or operate a business that uses honey, this package gives you a practical option for planning your supply.',
      'Think ahead, stock up, and keep the sweetness flowing.',
    ],
    uses: ['Larger households', 'Restaurants and cafés', 'Food preparation', 'Businesses with regular honey requirements', 'Bulk purchasing'],
    idealFor: 'Frequent honey users, hospitality businesses, and customers who prefer bulk quantities.',
    cta: 'Stock Up on Sweetness.',
  },
  'ubwiwacu-honey-7kg': {
    marketingName: 'The Business Essential',
    story: [
      'Great partnerships are built on planning, consistency, and understanding what your business needs.',
      "The 7 kg Ubw'iwacu Honey package is designed for customers who need a substantial quantity for regular use.",
      'From cafés and restaurants to larger households and organizations, this package offers a convenient option for planning higher-volume honey requirements.',
      "If honey is part of what you serve, prepare, or share every day, think bigger with Ubw'iwacu Honey.",
    ],
    uses: ['Restaurant and café operations', 'Larger kitchens', 'Food-service businesses', 'Higher-volume household consumption', 'Bulk purchasing'],
    idealFor: 'Businesses and customers with substantial honey requirements.',
    cta: 'Go Bigger. Share More Sweetness.',
  },
  'ubwiwacu-premium-honey-1kg': {
    marketingName: 'The Signature Gift',
    story: [
      'Some gifts are remembered not only for what they contain, but also for the thought behind them.',
      "The Ubw'iwacu Premium Honey Package is designed for customers who want their honey purchase to feel more special.",
      'Whether you are celebrating an important occasion, preparing a thoughtful gift, or choosing something distinctive for someone important, this package brings a more elevated presentation to the experience.',
      'Inspired by the beauty of Rwanda and the natural appeal of honey, it represents a more considered way to give, share, and enjoy.',
      'Because some moments deserve something special.',
    ],
    uses: ['Personal gifts', 'Special occasions', 'Corporate gifting', 'Thoughtful appreciation gifts', 'Premium home presentation'],
    idealFor: 'Customers seeking a premium package, gift buyers, and organizations interested in suitable corporate gifts.',
    cta: 'Give Something Naturally Special.',
  },
}

export const productCopy = (product) => {
  const copy = PRODUCT_COPY[product?.slug]
  if (copy) return copy
  return {
    marketingName: product?.category === 'premium' ? 'Premium selection' : "Ubw'iwacu Honey",
    story: product?.marketing_story ? [product.marketing_story] : [],
    uses: product?.suggested_uses
      ? product.suggested_uses.split('.').map((s) => s.trim()).filter(Boolean)
      : [],
    idealFor: null,
    cta: null,
  }
}
