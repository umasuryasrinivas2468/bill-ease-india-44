/**
 * Common Indian HSN (Harmonized System of Nomenclature) codes
 * with their product descriptions and suggested inventory categories.
 *
 * The list covers the most-used codes for small/medium Indian businesses.
 * HSN codes are hierarchical: 2-digit chapter → 4-digit heading → 6/8-digit sub-heading.
 */

export interface HSNEntry {
  code: string;
  description: string;
  category: string;
}

export const HSN_CODES: HSNEntry[] = [
  // Chapter 01–05: Live animals & animal products
  { code: "0201", description: "Meat of bovine animals, fresh or chilled", category: "Meat & Poultry" },
  { code: "0207", description: "Meat and edible offal of poultry", category: "Meat & Poultry" },
  { code: "0401", description: "Milk and cream, not concentrated", category: "Dairy Products" },
  { code: "0402", description: "Milk and cream, concentrated or sweetened", category: "Dairy Products" },
  { code: "0406", description: "Cheese and curd", category: "Dairy Products" },

  // Chapter 06–14: Vegetable products
  { code: "0701", description: "Potatoes, fresh or chilled", category: "Vegetables" },
  { code: "0713", description: "Dried leguminous vegetables (pulses)", category: "Pulses & Grains" },
  { code: "0901", description: "Coffee", category: "Beverages" },
  { code: "0902", description: "Tea", category: "Beverages" },
  { code: "0910", description: "Ginger, saffron, turmeric, spices", category: "Spices" },
  { code: "1001", description: "Wheat and meslin", category: "Pulses & Grains" },
  { code: "1005", description: "Maize (corn)", category: "Pulses & Grains" },
  { code: "1006", description: "Rice", category: "Pulses & Grains" },

  // Chapter 15: Fats & oils
  { code: "1507", description: "Soya-bean oil", category: "Edible Oils" },
  { code: "1508", description: "Groundnut oil", category: "Edible Oils" },
  { code: "1509", description: "Olive oil", category: "Edible Oils" },
  { code: "1511", description: "Palm oil", category: "Edible Oils" },
  { code: "1512", description: "Sunflower or safflower oil", category: "Edible Oils" },
  { code: "1515", description: "Other fixed vegetable fats and oils (sesame, mustard)", category: "Edible Oils" },

  // Chapter 17–21: Prepared foodstuffs
  { code: "1701", description: "Cane or beet sugar", category: "Food & Groceries" },
  { code: "1704", description: "Sugar confectionery (sweets)", category: "Food & Groceries" },
  { code: "1806", description: "Chocolate and cocoa preparations", category: "Food & Groceries" },
  { code: "1905", description: "Bread, pastry, cakes, biscuits", category: "Food & Groceries" },
  { code: "2106", description: "Food preparations (namkeen, ready-to-eat)", category: "Food & Groceries" },
  { code: "2201", description: "Water, mineral water, aerated water", category: "Beverages" },
  { code: "2202", description: "Sweetened or flavoured water & soft drinks", category: "Beverages" },

  // Chapter 22: Beverages
  { code: "2204", description: "Wine", category: "Beverages" },
  { code: "2208", description: "Spirits and liqueurs", category: "Beverages" },

  // Chapter 25–27: Mineral products
  { code: "2523", description: "Cement", category: "Building Materials" },
  { code: "2710", description: "Petroleum oils (petrol, diesel, kerosene)", category: "Fuel & Petroleum" },
  { code: "2711", description: "Petroleum gas and gaseous hydrocarbons (LPG)", category: "Fuel & Petroleum" },

  // Chapter 28–38: Chemicals
  { code: "3004", description: "Medicaments / pharmaceutical preparations", category: "Pharmaceuticals" },
  { code: "3006", description: "Pharmaceutical goods (surgical sutures, first-aid)", category: "Pharmaceuticals" },
  { code: "3208", description: "Paints and varnishes", category: "Paints & Chemicals" },
  { code: "3209", description: "Paints and varnishes (water-based)", category: "Paints & Chemicals" },
  { code: "3213", description: "Artists' colours and paints", category: "Paints & Chemicals" },
  { code: "3304", description: "Beauty, make-up, skin care preparations", category: "Cosmetics & Personal Care" },
  { code: "3305", description: "Hair care preparations (shampoo, conditioner)", category: "Cosmetics & Personal Care" },
  { code: "3306", description: "Oral hygiene preparations (toothpaste)", category: "Cosmetics & Personal Care" },
  { code: "3307", description: "Perfumes, deodorants, room fresheners", category: "Cosmetics & Personal Care" },
  { code: "3401", description: "Soap, washing preparations, detergents", category: "Cleaning Supplies" },
  { code: "3402", description: "Organic surface-active agents, detergents", category: "Cleaning Supplies" },

  // Chapter 39–40: Plastics & rubber
  { code: "3917", description: "Tubes, pipes, hoses of plastics", category: "Plastics & Packaging" },
  { code: "3919", description: "Self-adhesive plates, tapes of plastics", category: "Plastics & Packaging" },
  { code: "3923", description: "Plastic containers, boxes, bags", category: "Plastics & Packaging" },
  { code: "3926", description: "Other articles of plastics", category: "Plastics & Packaging" },
  { code: "4011", description: "New pneumatic tyres of rubber", category: "Rubber & Tyres" },

  // Chapter 44–49: Wood, paper, printed materials
  { code: "4802", description: "Paper and paperboard (writing, printing)", category: "Stationery & Paper" },
  { code: "4810", description: "Coated paper and paperboard", category: "Stationery & Paper" },
  { code: "4818", description: "Toilet paper, tissues, napkins, diapers", category: "Paper Products" },
  { code: "4819", description: "Cartons, boxes, bags of paper/paperboard", category: "Packaging" },
  { code: "4820", description: "Registers, notebooks, diaries, memo pads", category: "Stationery & Paper" },
  { code: "4821", description: "Paper labels", category: "Stationery & Paper" },
  { code: "4901", description: "Printed books, newspapers, periodicals", category: "Books & Printing" },
  { code: "4911", description: "Other printed matter (brochures, posters, calendars)", category: "Books & Printing" },

  // Chapter 52–63: Textiles & garments
  { code: "5208", description: "Woven cotton fabrics", category: "Textiles & Fabrics" },
  { code: "5209", description: "Woven cotton fabrics (≥85% cotton, >200g/m²)", category: "Textiles & Fabrics" },
  { code: "5407", description: "Woven fabrics of synthetic filament yarn", category: "Textiles & Fabrics" },
  { code: "6101", description: "Men's knitted overcoats, jackets", category: "Garments" },
  { code: "6104", description: "Women's knitted suits, dresses, skirts", category: "Garments" },
  { code: "6109", description: "T-shirts, singlets, vests (knitted)", category: "Garments" },
  { code: "6110", description: "Jerseys, pullovers, cardigans (knitted)", category: "Garments" },
  { code: "6203", description: "Men's suits, trousers, shorts (woven)", category: "Garments" },
  { code: "6204", description: "Women's suits, dresses, skirts (woven)", category: "Garments" },
  { code: "6205", description: "Men's shirts (woven)", category: "Garments" },
  { code: "6206", description: "Women's blouses, shirts (woven)", category: "Garments" },
  { code: "6302", description: "Bed linen, table linen, toilet linen", category: "Home Textiles" },
  { code: "6305", description: "Sacks and bags for packing", category: "Packaging" },

  // Chapter 64–67: Footwear, headgear
  { code: "6401", description: "Waterproof footwear with rubber/plastic outer soles", category: "Footwear" },
  { code: "6402", description: "Footwear with rubber/plastic outer soles and uppers", category: "Footwear" },
  { code: "6403", description: "Footwear with rubber/plastic outer soles and leather uppers", category: "Footwear" },
  { code: "6404", description: "Footwear with rubber/plastic outer soles and textile uppers", category: "Footwear" },
  { code: "6405", description: "Other footwear", category: "Footwear" },

  // Chapter 68–70: Stone, ceramic, glass
  { code: "6802", description: "Worked stone (marble, granite, sandstone)", category: "Building Materials" },
  { code: "6907", description: "Ceramic tiles (floor, wall)", category: "Building Materials" },
  { code: "6910", description: "Ceramic sanitary fixtures (sinks, toilets)", category: "Sanitary Ware" },
  { code: "7005", description: "Float glass and surface-ground glass", category: "Glass & Mirrors" },
  { code: "7010", description: "Glass bottles, jars, containers", category: "Glass & Mirrors" },
  { code: "7013", description: "Glassware (drinking glasses, vases)", category: "Glass & Mirrors" },

  // Chapter 72–73: Iron & steel
  { code: "7204", description: "Iron and steel scrap", category: "Metals & Alloys" },
  { code: "7208", description: "Hot-rolled steel plates/sheets", category: "Metals & Alloys" },
  { code: "7210", description: "Flat-rolled steel, coated/plated", category: "Metals & Alloys" },
  { code: "7213", description: "Hot-rolled steel bars and rods", category: "Metals & Alloys" },
  { code: "7304", description: "Steel tubes and pipes (seamless)", category: "Metals & Alloys" },
  { code: "7306", description: "Steel tubes and pipes (welded)", category: "Metals & Alloys" },
  { code: "7308", description: "Steel structures, towers, columns", category: "Building Materials" },
  { code: "7318", description: "Screws, bolts, nuts, washers of iron/steel", category: "Hardware & Fasteners" },
  { code: "7323", description: "Steel household articles (utensils)", category: "Kitchenware" },

  // Chapter 74–81: Other metals
  { code: "7404", description: "Copper scrap", category: "Metals & Alloys" },
  { code: "7408", description: "Copper wire", category: "Electrical Supplies" },
  { code: "7606", description: "Aluminium plates, sheets, strips", category: "Metals & Alloys" },
  { code: "7610", description: "Aluminium structures (doors, windows)", category: "Building Materials" },
  { code: "7615", description: "Aluminium household articles (utensils)", category: "Kitchenware" },

  // Chapter 82–83: Tools & cutlery
  { code: "8201", description: "Hand tools (spades, axes, sickles)", category: "Tools & Hardware" },
  { code: "8203", description: "Files, pliers, pincers, tweezers", category: "Tools & Hardware" },
  { code: "8205", description: "Hand tools NES (hammers, screwdrivers)", category: "Tools & Hardware" },
  { code: "8211", description: "Knives with cutting blades", category: "Tools & Hardware" },
  { code: "8302", description: "Base metal fittings (hinges, locks, handles)", category: "Hardware & Fasteners" },

  // Chapter 84: Machinery
  { code: "8401", description: "Nuclear reactors and parts", category: "Heavy Machinery" },
  { code: "8403", description: "Central heating boilers", category: "Heavy Machinery" },
  { code: "8413", description: "Pumps for liquids", category: "Machinery & Equipment" },
  { code: "8414", description: "Air pumps, vacuum pumps, compressors, fans", category: "Machinery & Equipment" },
  { code: "8415", description: "Air conditioning machines", category: "Appliances" },
  { code: "8418", description: "Refrigerators, freezers", category: "Appliances" },
  { code: "8422", description: "Dishwashing machines, packaging machines", category: "Machinery & Equipment" },
  { code: "8423", description: "Weighing machines, scales", category: "Machinery & Equipment" },
  { code: "8433", description: "Harvesting machines, threshers", category: "Agricultural Equipment" },
  { code: "8436", description: "Agricultural, horticultural, forestry machines", category: "Agricultural Equipment" },
  { code: "8443", description: "Printing machines, printers, copiers", category: "Office Equipment" },
  { code: "8450", description: "Washing machines", category: "Appliances" },
  { code: "8467", description: "Power tools (drills, saws, grinders)", category: "Tools & Hardware" },
  { code: "8471", description: "Automatic data processing machines (computers, laptops)", category: "Computers & IT" },
  { code: "8473", description: "Computer parts and accessories", category: "Computers & IT" },

  // Chapter 85: Electrical equipment
  { code: "8501", description: "Electric motors and generators", category: "Electrical Equipment" },
  { code: "8504", description: "Electrical transformers, converters (UPS, adapters)", category: "Electrical Equipment" },
  { code: "8506", description: "Primary cells and batteries", category: "Batteries & Power" },
  { code: "8507", description: "Electric accumulators (rechargeable batteries)", category: "Batteries & Power" },
  { code: "8516", description: "Electric water heaters, hair dryers, irons", category: "Appliances" },
  { code: "8517", description: "Telephones, smartphones, modems, routers", category: "Mobile & Telecom" },
  { code: "8518", description: "Microphones, loudspeakers, headphones", category: "Audio & Video" },
  { code: "8519", description: "Sound recording/reproducing apparatus", category: "Audio & Video" },
  { code: "8521", description: "Video recording/reproducing apparatus", category: "Audio & Video" },
  { code: "8523", description: "Discs, tapes, USB drives, memory cards", category: "Storage Media" },
  { code: "8525", description: "Transmission apparatus, TV cameras, CCTV", category: "Security & Surveillance" },
  { code: "8527", description: "Radio receivers", category: "Audio & Video" },
  { code: "8528", description: "Monitors, projectors, televisions", category: "Audio & Video" },
  { code: "8529", description: "Parts for TVs, monitors, radios", category: "Audio & Video" },
  { code: "8531", description: "Electric sound/visual signaling apparatus (alarms, buzzers)", category: "Security & Surveillance" },
  { code: "8534", description: "Printed circuits (PCBs)", category: "Electronic Components" },
  { code: "8536", description: "Electrical switches, plugs, sockets, connectors", category: "Electrical Supplies" },
  { code: "8539", description: "Electric filament or discharge lamps (LED, CFL)", category: "Lighting" },
  { code: "8541", description: "Semiconductor devices, diodes, transistors", category: "Electronic Components" },
  { code: "8542", description: "Electronic integrated circuits (chips)", category: "Electronic Components" },
  { code: "8544", description: "Insulated wire, cables, optical fibre cables", category: "Electrical Supplies" },

  // Chapter 87: Vehicles
  { code: "8702", description: "Motor vehicles for 10+ persons (buses)", category: "Vehicles" },
  { code: "8703", description: "Motor cars and vehicles for transport of persons", category: "Vehicles" },
  { code: "8704", description: "Motor vehicles for goods transport (trucks)", category: "Vehicles" },
  { code: "8708", description: "Parts and accessories of motor vehicles", category: "Auto Parts & Accessories" },
  { code: "8711", description: "Motorcycles and cycles with auxiliary motor", category: "Vehicles" },
  { code: "8712", description: "Bicycles and other cycles (non-motorized)", category: "Vehicles" },
  { code: "8714", description: "Parts and accessories of bicycles/motorcycles", category: "Auto Parts & Accessories" },

  // Chapter 90: Optical, medical instruments
  { code: "9001", description: "Optical fibres, lenses, prisms", category: "Optical Instruments" },
  { code: "9003", description: "Frames and mountings for spectacles", category: "Eyewear" },
  { code: "9004", description: "Spectacles, goggles (corrective, protective, sunglasses)", category: "Eyewear" },
  { code: "9018", description: "Medical, surgical, dental instruments", category: "Medical Equipment" },
  { code: "9021", description: "Orthopaedic appliances, artificial body parts", category: "Medical Equipment" },
  { code: "9025", description: "Thermometers, barometers, hydrometers", category: "Measuring Instruments" },
  { code: "9028", description: "Gas, liquid or electricity meters", category: "Measuring Instruments" },
  { code: "9029", description: "Speedometers, tachometers, counters", category: "Measuring Instruments" },
  { code: "9030", description: "Oscilloscopes, spectrum analysers, multimeters", category: "Measuring Instruments" },
  { code: "9032", description: "Automatic regulating or controlling instruments", category: "Measuring Instruments" },

  // Chapter 91: Clocks and watches
  { code: "9101", description: "Wrist-watches (electrically operated)", category: "Watches & Clocks" },
  { code: "9102", description: "Wrist-watches (mechanically operated)", category: "Watches & Clocks" },
  { code: "9105", description: "Other clocks (wall clocks, alarm clocks)", category: "Watches & Clocks" },

  // Chapter 94: Furniture, lighting, signs
  { code: "9401", description: "Seats / chairs (office, car, aircraft seats)", category: "Furniture" },
  { code: "9403", description: "Other furniture (desks, shelves, cupboards)", category: "Furniture" },
  { code: "9404", description: "Mattresses, quilts, sleeping bags", category: "Furniture" },
  { code: "9405", description: "Lamps, light fittings, illuminated signs", category: "Lighting" },
  { code: "9406", description: "Prefabricated buildings", category: "Building Materials" },

  // Chapter 95: Toys, games, sports equipment
  { code: "9503", description: "Toys (tricycles, dolls, puzzles, models)", category: "Toys & Games" },
  { code: "9504", description: "Video game consoles, articles for games", category: "Toys & Games" },
  { code: "9506", description: "Sports equipment (gym, athletics, swimming)", category: "Sports Equipment" },

  // Chapter 96: Miscellaneous manufactured articles
  { code: "9608", description: "Ball-point pens, felt-tipped pens, markers", category: "Stationery & Paper" },
  { code: "9609", description: "Pencils, crayons, chalks", category: "Stationery & Paper" },
  { code: "9613", description: "Cigarette lighters and other lighters", category: "Miscellaneous" },
  { code: "9615", description: "Combs, hair-slides, hairpins", category: "Cosmetics & Personal Care" },
  { code: "9616", description: "Scent sprays, powder puffs, applicators", category: "Cosmetics & Personal Care" },
  { code: "9617", description: "Vacuum flasks and vessels", category: "Kitchenware" },

  // Chapter 97: Works of art
  { code: "9701", description: "Paintings, drawings, pastels", category: "Art & Collectibles" },
  { code: "9703", description: "Original sculptures and statuary", category: "Art & Collectibles" },
];

/**
 * Search HSN codes by code prefix or description keyword.
 * Returns the top `limit` matches.
 */
export function searchHSN(query: string, limit = 15): HSNEntry[] {
  if (!query || query.trim().length === 0) return [];

  const q = query.trim().toLowerCase();

  // Exact code prefix matches first, then description/category matches
  const codeMatches: HSNEntry[] = [];
  const textMatches: HSNEntry[] = [];

  for (const entry of HSN_CODES) {
    if (entry.code.startsWith(q)) {
      codeMatches.push(entry);
    } else if (
      entry.description.toLowerCase().includes(q) ||
      entry.category.toLowerCase().includes(q)
    ) {
      textMatches.push(entry);
    }
  }

  return [...codeMatches, ...textMatches].slice(0, limit);
}
