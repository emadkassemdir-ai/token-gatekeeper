/**
 * BlockTypes - Improved colors for better Minecraft look
 */

export const AIR = 0;

export const BLOCKS = {
  1: {
    id: 1,
    name: 'Grass',
    color: [0.4, 0.65, 0.3],
    faceColors: {
      top: [0.35, 0.72, 0.25],      // Nice grass green
      bottom: [0.55, 0.38, 0.22],   // Dirt brown
      side: [0.48, 0.58, 0.32]      // Grass side
    },
    solid: true,
    transparent: false,
    breakable: true,
    hardness: 0.6,
    liquid: false
  },
  2: {
    id: 2,
    name: 'Dirt',
    color: [0.55, 0.38, 0.22],
    solid: true,
    transparent: false,
    breakable: true,
    hardness: 0.5,
    liquid: false
  },
  3: {
    id: 3,
    name: 'Stone',
    color: [0.55, 0.55, 0.58],
    faceColors: {
      top: [0.6, 0.6, 0.63],
      bottom: [0.48, 0.48, 0.5],
      side: [0.52, 0.52, 0.55]
    },
    solid: true,
    transparent: false,
    breakable: true,
    hardness: 1.5,
    liquid: false
  },
  4: {
    id: 4,
    name: 'Bedrock',
    color: [0.25, 0.25, 0.28],
    solid: true,
    transparent: false,
    breakable: false,
    hardness: Infinity,
    liquid: false
  },
  5: {
    id: 5,
    name: 'Oak Wood',
    color: [0.55, 0.42, 0.22],
    faceColors: {
      top: [0.65, 0.52, 0.3],
      bottom: [0.65, 0.52, 0.3],
      side: [0.48, 0.35, 0.18]
    },
    solid: true,
    transparent: false,
    breakable: true,
    hardness: 1.0,
    liquid: false
  },
  6: {
    id: 6,
    name: 'Oak Leaves',
    color: [0.25, 0.55, 0.2],
    solid: true,
    transparent: true,
    breakable: true,
    hardness: 0.2,
    liquid: false,
    opacity: 0.85
  },
  7: {
    id: 7,
    name: 'Sand',
    color: [0.9, 0.85, 0.6],
    solid: true,
    transparent: false,
    breakable: true,
    hardness: 0.5,
    liquid: false
  },
  8: {
    id: 8,
    name: 'Water',
    color: [0.15, 0.45, 0.85],
    solid: false,
    transparent: true,
    breakable: false,
    hardness: Infinity,
    liquid: true,
    animated: true,
    opacity: 0.65
  },
  9: {
    id: 9,
    name: 'Glass',
    color: [0.75, 0.88, 0.95],
    solid: true,
    transparent: true,
    breakable: true,
    hardness: 0.3,
    liquid: false,
    opacity: 0.35
  },
  10: {
    id: 10,
    name: 'Iron Ore',
    color: [0.6, 0.55, 0.5],
    faceColors: {
      top: [0.65, 0.6, 0.55],
      bottom: [0.55, 0.5, 0.45],
      side: [0.58, 0.52, 0.48]
    },
    solid: true,
    transparent: false,
    breakable: true,
    hardness: 2.5,
    liquid: false
  },
  11: {
    id: 11,
    name: 'Oak Planks',
    color: [0.68, 0.52, 0.3],
    faceColors: {
      top: [0.72, 0.55, 0.32],
      bottom: [0.62, 0.48, 0.28],
      side: [0.65, 0.5, 0.28]
    },
    solid: true,
    transparent: false,
    breakable: true,
    hardness: 1.0,
    liquid: false
  },
  // Add more blocks as needed...
};
