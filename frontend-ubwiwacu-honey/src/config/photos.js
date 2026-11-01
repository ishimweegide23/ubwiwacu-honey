// Real product photographs (spec §6.3: only genuine photos of our own packages).
import { assetUrl } from '../lib/api.js'
import rangeAll from '../assets/photos/range-all-products.jpg'
import kg1Studio from '../assets/photos/1kg-studio.png'
import kg1Pair from '../assets/photos/Premium Ubw’iwacu Honey Jars.png'
import kg1Hand from '../assets/photos/1kg-in-hand.png'
import kg1Outdoor from '../assets/photos/1kg-outdoor.png'
import kg1Pyramid from '../assets/photos/1kg Ubw’iwacu Honey Pyramid.png'
import kg1Street from '../assets/photos/Ubw’iwacu Honey Jar Street Scene.png'
import g500Single from '../assets/photos/500g-single.png'
import g500Board from '../assets/photos/500g-wood-board.png'
import g500Studio from '../assets/photos/500g-studio.png'
import g500Display from '../assets/photos/Ubw’iwacu Honey Jar Display.png'
import g500Highlands from '../assets/photos/Ubw’i wacu Honey in the Highlands.png'
import mixStack from '../assets/photos/Ubw’i Wacu Honey Jar Arrangement.png'
import kg5Backdrop from '../assets/photos/5kg-backdrop.png'
import kg5Studio from '../assets/photos/5kg-studio.png'
import kg7Studio from '../assets/photos/7kg-studio.png'
import kg7Tiles from '../assets/photos/7kg-tiles.png'
import kg7Jug from '../assets/photos/Ubw’iwacu 7kg Honey Jug.png'
import brandLogo from '../assets/photos/Ubwiwacu logo.jpeg'

export const PHOTOS = {
  rangeAll,
  kg1Studio,
  kg1Pair,
  kg1Hand,
  kg1Outdoor,
  kg1Pyramid,
  kg1Street,
  g500Single,
  g500Board,
  g500Studio,
  g500Display,
  g500Highlands,
  mixStack,
  kg5Backdrop,
  kg5Studio,
  kg7Studio,
  kg7Tiles,
  kg7Jug,
  brandLogo,
}

/**
 * Photos per product slug: the first is the cover (clean background, used on cards),
 * the rest form the product-page gallery. 350 g and Premium 1 kg have no photos yet,
 * so they keep the jar illustration.
 */
export const PRODUCT_PHOTOS = {
  'ubwiwacu-honey-500g': [g500Single, g500Studio, g500Board, g500Display, g500Highlands, mixStack],
  'ubwiwacu-honey-1kg': [kg1Studio, kg1Street, kg1Pyramid, kg1Pair, kg1Hand, kg1Outdoor, mixStack],
  'ubwiwacu-honey-5kg': [kg5Studio, kg5Backdrop],
  'ubwiwacu-honey-7kg': [kg7Studio, kg7Jug, kg7Tiles],
}

export const productPhotos = (slug) => PRODUCT_PHOTOS[slug] || []

/** Uploaded image from the API first, then our own product photo; null means use the jar illustration. */
export const productImage = (product) =>
  assetUrl(product?.image_url || product?.image) || productPhotos(product?.slug)[0] || null
