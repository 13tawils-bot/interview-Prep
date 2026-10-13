// Demo catalogue for the outfit builder. Retailers, products and prices are
// illustrative, not live stock. Swap this file for a real product feed
// (affiliate network or retailer API) with the same shape to go live.
(function (root, factory) {
  const data = factory();
  if (typeof module === "object" && module.exports) module.exports = data;
  else root.OUTFIT_CATALOGUE = data;
})(typeof self !== "undefined" ? self : this, function () {
  // Delivery is charged per retailer unless that basket reaches freeOver.
  const retailers = {
    NL: { name: "Northline", delivery: 3.99, freeOver: 40 },
    MV: { name: "Mercer & Vale", delivery: 4.95, freeOver: 75 },
    CT: { name: "Common Thread", delivery: 2.99, freeOver: 25 },
    SA: { name: "Second Act", delivery: 3.5, freeOver: null, resale: true },
    FH: { name: "Fieldhouse", delivery: 3.95, freeOver: 50 },
  };

  // [retailer, name, category, gender, price, colour, family, aesthetics, occasions, warmth?]
  // gender: w womenswear, m menswear, u unisex
  // aesthetics: min minimal, cla classic, str streetwear, boh boho, edg edgy, rom romantic
  // occasions: cas casual, wrk work, int interview, dat date night, wed wedding guest, par party
  const rows = [
    // Womenswear tops
    ["CT", "Ribbed cotton tank", "top", "w", 12, "white", "neutral", "min str cla", "cas dat par"],
    ["CT", "Boxy heavyweight tee", "top", "w", 14, "black", "neutral", "min str edg", "cas"],
    ["NL", "Poplin oversized shirt", "top", "w", 28, "white", "neutral", "min cla", "wrk int cas dat"],
    ["MV", "Silk-feel cami", "top", "w", 45, "champagne", "neutral", "rom min", "dat par wed"],
    ["NL", "Fine-knit polo cardigan", "top", "w", 32, "navy", "neutral", "cla min", "wrk int cas"],
    ["SA", "Vintage crochet top", "top", "w", 24, "cream", "neutral", "boh rom", "cas dat wed"],
    ["NL", "Puff-sleeve blouse", "top", "w", 30, "blush", "pastel", "rom", "dat wed wrk"],
    ["CT", "Graphic band tee", "top", "w", 16, "charcoal", "neutral", "str edg", "cas par"],
    ["MV", "Merino crew jumper", "top", "w", 65, "camel", "neutral", "cla min", "wrk int cas"],
    ["NL", "Mesh long-sleeve top", "top", "w", 22, "black", "neutral", "edg str", "par dat"],
    ["SA", "Embroidered peasant blouse", "top", "w", 26, "white", "neutral", "boh", "cas wed dat"],
    ["MV", "Satin wrap blouse", "top", "w", 58, "emerald", "bold", "rom cla", "wrk dat par wed"],
    ["NL", "Cropped zip hoodie", "top", "w", 30, "grey", "neutral", "str", "cas"],
    ["CT", "Striped Breton top", "top", "w", 15, "navy stripe", "print", "cla", "cas wrk"],
    ["SA", "Faux-leather corset top", "top", "w", 28, "black", "neutral", "edg", "par dat"],
    // Womenswear bottoms
    ["NL", "Wide-leg tailored trousers", "bottom", "w", 38, "black", "neutral", "min cla edg", "wrk int dat par"],
    ["MV", "Pleated wool-blend trousers", "bottom", "w", 79, "grey", "neutral", "cla min", "wrk int wed"],
    ["CT", "Straight-leg jeans", "bottom", "w", 25, "indigo", "neutral", "cla min str", "cas dat"],
    ["NL", "Baggy carpenter jeans", "bottom", "w", 36, "light denim", "neutral", "str", "cas"],
    ["SA", "Vintage high-rise jeans", "bottom", "w", 30, "indigo", "neutral", "cla boh str", "cas dat"],
    ["NL", "Satin bias midi skirt", "bottom", "w", 32, "champagne", "neutral", "rom min", "dat wed par wrk"],
    ["SA", "Tiered floral maxi skirt", "bottom", "w", 28, "floral", "print", "boh rom", "cas wed dat"],
    ["CT", "Parachute cargo trousers", "bottom", "w", 22, "khaki", "earth", "str", "cas"],
    ["MV", "Leather midi skirt", "bottom", "w", 95, "black", "neutral", "edg cla min", "dat par wrk"],
    ["NL", "Faux-leather mini skirt", "bottom", "w", 24, "black", "neutral", "edg", "par dat"],
    ["CT", "Linen drawstring trousers", "bottom", "w", 20, "sand", "neutral", "boh min", "cas"],
    ["NL", "Pleated midi skirt", "bottom", "w", 34, "olive", "earth", "cla rom", "wrk wed dat"],
    ["MV", "Tailored shorts", "bottom", "w", 48, "cream", "neutral", "min cla", "cas dat"],
    // Womenswear dresses
    ["NL", "Slip midi dress", "dress", "w", 42, "black", "neutral", "min rom edg", "dat par wed"],
    ["MV", "Crepe column dress", "dress", "w", 120, "cobalt", "bold", "min cla", "wed par dat"],
    ["SA", "Vintage floral tea dress", "dress", "w", 38, "floral", "print", "boh rom", "wed dat cas"],
    ["CT", "Jersey T-shirt dress", "dress", "w", 18, "grey", "neutral", "min str", "cas"],
    ["NL", "Ruched satin mini dress", "dress", "w", 39, "red", "bold", "rom edg", "par dat"],
    ["MV", "Pleated satin midi dress", "dress", "w", 110, "sage", "pastel", "rom cla", "wed dat"],
    ["NL", "Belted shirt dress", "dress", "w", 40, "olive", "earth", "cla", "wrk cas int"],
    ["SA", "Broderie maxi dress", "dress", "w", 44, "white", "neutral", "boh rom", "wed cas"],
    ["MV", "Tailored blazer dress", "dress", "w", 98, "black", "neutral", "cla min edg", "wrk int par"],
    ["NL", "Lace-trim cami dress", "dress", "w", 36, "lilac", "pastel", "rom", "wed dat"],
    ["CT", "Smocked sundress", "dress", "w", 22, "rust", "earth", "boh", "cas dat"],
    // Womenswear outerwear
    ["MV", "Wool-blend tailored coat", "outer", "w", 145, "camel", "neutral", "cla min", "wrk int wed dat cas", 3],
    ["NL", "Oversized blazer", "outer", "w", 55, "black", "neutral", "min cla edg", "wrk int dat par wed cas", 1],
    ["CT", "Denim jacket", "outer", "w", 28, "indigo", "neutral", "cla str boh", "cas", 1],
    ["SA", "Vintage suede jacket", "outer", "w", 60, "tan", "earth", "boh", "cas dat", 2],
    ["NL", "Faux-leather biker jacket", "outer", "w", 45, "black", "neutral", "edg str", "cas dat par", 2],
    ["NL", "Cropped trench coat", "outer", "w", 49, "stone", "neutral", "cla min", "wrk cas int", 1],
    ["CT", "Padded puffer jacket", "outer", "w", 35, "black", "neutral", "str min", "cas", 3],
    ["MV", "Cropped bouclé jacket", "outer", "w", 89, "cream", "neutral", "cla rom", "wed wrk dat", 1],
    ["SA", "Shearling-trim coat", "outer", "w", 70, "brown", "earth", "boh", "cas", 3],
    // Menswear tops
    ["CT", "Heavyweight tee", "top", "m", 12, "white", "neutral", "min str cla", "cas"],
    ["NL", "Oxford button-down shirt", "top", "m", 28, "pale blue", "neutral", "cla min", "wrk int cas dat wed"],
    ["MV", "Merino roll neck", "top", "m", 69, "black", "neutral", "min cla edg", "wrk dat par int"],
    ["NL", "Cuban-collar shirt", "top", "m", 26, "cream", "neutral", "cla boh", "dat par cas wed"],
    ["SA", "Vintage bowling shirt", "top", "m", 22, "retro print", "print", "boh str", "cas par"],
    ["CT", "Graphic tee", "top", "m", 15, "black", "neutral", "str edg", "cas par"],
    ["MV", "Poplin dress shirt", "top", "m", 55, "white", "neutral", "cla min", "wrk int wed"],
    ["NL", "Knitted polo", "top", "m", 32, "navy", "neutral", "cla min", "dat wrk cas wed"],
    ["CT", "Loopback hoodie", "top", "m", 25, "grey", "neutral", "str min", "cas"],
    ["NL", "Linen shirt", "top", "m", 30, "sand", "neutral", "boh min cla", "cas dat wed"],
    ["SA", "Vintage band tee", "top", "m", 20, "charcoal", "neutral", "edg str", "cas par"],
    ["MV", "Printed silk-blend shirt", "top", "m", 75, "paisley", "print", "edg rom", "par dat"],
    ["NL", "Cotton overshirt", "top", "m", 38, "olive", "earth", "str cla", "cas"],
    // Menswear bottoms
    ["NL", "Slim tailored trousers", "bottom", "m", 35, "navy", "neutral", "cla min", "wrk int dat wed"],
    ["MV", "Wool suit trousers", "bottom", "m", 85, "charcoal", "neutral", "cla min", "wrk int wed"],
    ["CT", "Straight jeans", "bottom", "m", 25, "indigo", "neutral", "cla str min", "cas dat"],
    ["NL", "Relaxed cargo trousers", "bottom", "m", 32, "khaki", "earth", "str", "cas"],
    ["CT", "Cotton chinos", "bottom", "m", 22, "stone", "neutral", "cla min", "cas wrk dat"],
    ["SA", "Vintage black jeans", "bottom", "m", 26, "black", "neutral", "edg str", "cas par dat"],
    ["NL", "Pleated wide trousers", "bottom", "m", 40, "brown", "earth", "min cla boh", "dat wrk par"],
    ["CT", "Linen shorts", "bottom", "m", 18, "sand", "neutral", "boh min", "cas"],
    ["MV", "Cord trousers", "bottom", "m", 70, "rust", "earth", "boh cla", "cas dat"],
    // Menswear outerwear
    ["MV", "Unstructured wool blazer", "outer", "m", 140, "navy", "neutral", "cla min", "wrk int wed dat", 1],
    ["NL", "Suit blazer", "outer", "m", 60, "charcoal", "neutral", "cla", "wrk int wed", 1],
    ["NL", "Harrington jacket", "outer", "m", 45, "olive", "earth", "cla str", "cas dat", 1],
    ["CT", "Padded puffer jacket", "outer", "m", 38, "black", "neutral", "str min", "cas", 3],
    ["MV", "Wool overcoat", "outer", "m", 160, "camel", "neutral", "cla min", "wrk int wed dat", 3],
    ["SA", "Vintage leather jacket", "outer", "m", 85, "black", "neutral", "edg cla", "cas dat par", 2],
    ["SA", "Workwear chore jacket", "outer", "m", 40, "workwear blue", "neutral", "boh str cla", "cas", 1],
    // Shoes
    ["CT", "Canvas low-top trainers", "shoes", "u", 25, "white", "neutral", "str min cla", "cas"],
    ["NL", "Chunky leather trainers", "shoes", "u", 45, "white", "neutral", "str min", "cas dat"],
    ["FH", "Leather loafers", "shoes", "u", 65, "black", "neutral", "cla min", "wrk int dat wed"],
    ["FH", "Suede Chelsea boots", "shoes", "u", 75, "brown", "earth", "cla boh edg", "cas wrk dat"],
    ["FH", "Platform combat boots", "shoes", "u", 70, "black", "neutral", "edg str", "cas par dat"],
    ["FH", "Leather Derby shoes", "shoes", "m", 80, "black", "neutral", "cla min", "wrk int wed"],
    ["NL", "Strappy block heels", "shoes", "w", 36, "nude", "neutral", "rom min", "wed dat par"],
    ["NL", "Kitten-heel slingbacks", "shoes", "w", 32, "black", "neutral", "cla min rom", "wrk int dat wed"],
    ["FH", "Western ankle boots", "shoes", "w", 68, "tan", "earth", "boh", "cas dat"],
    ["CT", "Leather sandals", "shoes", "u", 18, "tan", "earth", "boh min", "cas"],
    ["FH", "Pointed court shoes", "shoes", "w", 55, "red", "bold", "cla rom edg", "par dat wed"],
    ["NL", "Mary Jane flats", "shoes", "w", 30, "black", "neutral", "rom cla", "wrk cas dat"],
    ["NL", "Metallic heeled sandals", "shoes", "w", 38, "silver", "neutral", "rom edg", "par wed"],
    ["FH", "Suede desert boots", "shoes", "m", 60, "sand", "neutral", "cla boh", "cas dat"],
    ["SA", "Vintage cowboy boots", "shoes", "u", 55, "brown", "earth", "boh edg", "cas par"],
    // Bags
    ["FH", "Leather tote", "bag", "u", 60, "black", "neutral", "min cla", "wrk int cas"],
    ["NL", "Shoulder baguette bag", "bag", "w", 25, "black", "neutral", "min rom edg", "dat par cas"],
    ["MV", "Structured top-handle bag", "bag", "w", 85, "tan", "earth", "cla", "wrk wed int"],
    ["CT", "Canvas tote", "bag", "u", 10, "natural", "neutral", "str boh min", "cas"],
    ["NL", "Satin clutch", "bag", "w", 22, "champagne", "neutral", "rom", "wed par dat"],
    ["SA", "Fringed suede bag", "bag", "w", 30, "tan", "earth", "boh", "cas wed"],
    ["NL", "Nylon crossbody bag", "bag", "u", 20, "black", "neutral", "str min", "cas"],
    ["FH", "Leather messenger bag", "bag", "m", 75, "brown", "earth", "cla", "wrk int"],
    ["NL", "Beaded mini bag", "bag", "w", 24, "pearl", "neutral", "rom boh", "wed par dat"],
    ["SA", "Studded shoulder bag", "bag", "w", 28, "black", "neutral", "edg", "par dat"],
    // Accessories
    ["CT", "Leather belt", "acc", "u", 12, "black", "neutral", "min cla edg", "wrk cas int dat"],
    ["FH", "Gold-tone hoop earrings", "acc", "w", 15, "gold", "neutral", "min cla rom", "dat wed par wrk"],
    ["FH", "Minimal steel watch", "acc", "u", 55, "silver", "neutral", "min cla", "wrk int dat wed"],
    ["NL", "Silk neck scarf", "acc", "w", 14, "scarf print", "print", "cla rom boh", "wed wrk dat"],
    ["CT", "Ribbed beanie", "acc", "u", 8, "black", "neutral", "str min", "cas"],
    ["SA", "Chain necklace", "acc", "u", 18, "silver", "neutral", "edg str", "par cas dat"],
    ["NL", "Pearl drop earrings", "acc", "w", 16, "pearl", "neutral", "rom cla", "wed dat"],
    ["MV", "Silk tie", "acc", "m", 40, "navy", "neutral", "cla", "wed int wrk"],
    ["NL", "Tinted sunglasses", "acc", "u", 18, "tortoiseshell", "earth", "boh str edg", "cas"],
    ["FH", "Woven straw hat", "acc", "u", 22, "natural", "neutral", "boh", "cas wed"],
  ];

  const swatches = {
    white: "#F4F4F1", black: "#1B1B1D", navy: "#1F2A44", grey: "#9A9CA3", charcoal: "#3A3B40",
    cream: "#EDE6D6", camel: "#B8875A", champagne: "#E6D3B3", stone: "#CFC6B5", sand: "#D8C3A0",
    indigo: "#2E3F68", "light denim": "#8FA9C8", "pale blue": "#C5D6EA", "workwear blue": "#3B5A86",
    khaki: "#8C8558", olive: "#646B3A", rust: "#A44A2A", brown: "#6B4630", tan: "#B07F52",
    tortoiseshell: "#6E4A2C", blush: "#EBC4C0", lilac: "#C9B8DE", sage: "#A9B89C",
    emerald: "#1E6B4E", cobalt: "#2847B8", red: "#B3202E", nude: "#D9B59A", silver: "#BFC2C7",
    gold: "#C9A44C", pearl: "#ECE7DD", natural: "#E2D6BC",
    "navy stripe": "repeating-linear-gradient(0deg,#1F2A44 0 3px,#F4F4F1 3px 6px)",
    floral: "radial-gradient(circle at 30% 30%,#C24E6B 0 18%,transparent 19%),radial-gradient(circle at 70% 65%,#E3A43C 0 15%,transparent 16%),#3F5A3A",
    "retro print": "repeating-linear-gradient(45deg,#E3A43C 0 4px,#2B6E6A 4px 8px)",
    paisley: "radial-gradient(circle at 40% 40%,#D9B44A 0 22%,transparent 23%),#5A1E3A",
    "scarf print": "repeating-linear-gradient(135deg,#B3202E 0 4px,#ECE7DD 4px 8px,#1F2A44 8px 12px)",
  };

  const products = rows.map((r, i) => ({
    id: `${r[0]}-${String(i + 1).padStart(3, "0")}`,
    retailer: r[0],
    name: r[1],
    category: r[2],
    gender: r[3],
    price: r[4],
    colour: r[5],
    family: r[6],
    aesthetics: r[7].split(" "),
    occasions: r[8].split(" "),
    warmth: r[9] || 0,
    swatch: swatches[r[5]] || "#999",
  }));

  return { retailers, products };
});
