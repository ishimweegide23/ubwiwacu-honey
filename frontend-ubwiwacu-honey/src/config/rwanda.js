// Rwanda's 5 provinces and 30 districts. Used when the server's full location
// dataset (sectors, cells, villages) is not available, and for quick picks.
export const PROVINCES = [
  { name: 'Kigali City', districts: ['Gasabo', 'Kicukiro', 'Nyarugenge'] },
  { name: 'Southern Province', districts: ['Gisagara', 'Huye', 'Kamonyi', 'Muhanga', 'Nyamagabe', 'Nyanza', 'Nyaruguru', 'Ruhango'] },
  { name: 'Western Province', districts: ['Karongi', 'Ngororero', 'Nyabihu', 'Nyamasheke', 'Rubavu', 'Rusizi', 'Rutsiro'] },
  { name: 'Northern Province', districts: ['Burera', 'Gakenke', 'Gicumbi', 'Musanze', 'Rulindo'] },
  { name: 'Eastern Province', districts: ['Bugesera', 'Gatsibo', 'Kayonza', 'Kirehe', 'Ngoma', 'Nyagatare', 'Rwamagana'] },
]

export const provinceOf = (district) => PROVINCES.find((p) => p.districts.includes(district))?.name || ''

// "Deliver to" area chosen in the header, reused at checkout.
const AREA_KEY = 'ubh_area'
export const areaStore = {
  get() {
    try {
      return JSON.parse(localStorage.getItem(AREA_KEY)) || null
    } catch {
      return null
    }
  },
  set(area) {
    if (area) localStorage.setItem(AREA_KEY, JSON.stringify(area))
    else localStorage.removeItem(AREA_KEY)
    window.dispatchEvent(new Event('ubh-area'))
  },
}

/** Short label for an area: "Kimihurura, Gasabo". */
export const areaLabel = (a) => (a ? [a.name, a.level !== 'district' && a.level !== 'province' ? a.district : null].filter(Boolean).join(', ') : '')
