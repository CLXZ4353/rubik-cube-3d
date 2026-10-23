// Curated last-layer algorithms.
//
// These are the algorithms people actually use, written from the standard
// OLL/PLL sheets rather than produced by the solver. The generator maps each
// one onto a case by rotating the state it solves into a valid last-layer
// case, then re-derives the setup from the algorithm, so the dataset is still
// checked end to end by tools/validate_algs.mjs.
//
// If an entry here is not a valid OLL/PLL algorithm it is reported and skipped;
// the case it would have covered falls back to the solver. That keeps the set
// complete even while the corpus is being corrected.

/** OLL 1..57, in the conventional numbering used by the sheets. */
export const OLL = [
  'R U2 R2 F R F\' U2 R\' F R F\'', // 1
  'F R U R\' U\' F\' f R U R\' U\' f\'', // 2
  'f R U R\' U\' f\' U\' F R U R\' U\' F\'', // 3
  'f R U R\' U\' f\' U F R U R\' U\' F\'', // 4
  'r\' U2 R U R\' U r', // 5
  'r U2 R\' U\' R U\' r\'', // 6
  'r U R\' U R U2 r\'', // 7
  'r\' U\' R U\' R\' U2 r', // 8
  'R U R\' U\' R\' F R2 U R\' U\' F\'', // 9
  'R U R\' U R\' F R F\' R U2 R\'', // 10
  'r U R\' U R\' F R F\' R U2 r\'', // 11
  'F R U R\' U\' F\' U F R U R\' U\' F\'', // 12
  "r U' r' U' r U r' F' U F", // 13
  'R\' F R U R\' F\' R F U\' F\'', // 14
  'r\' U\' r R\' U\' R U r\' U r', // 15
  'r U r\' R U R\' U\' r U\' r\'', // 16
  'R U R\' U R\' F R F\' U2 R\' F R F\'', // 17
  'R U2 R2 F R F\' U2 M\' U R U\' r\'', // 18
  'M U R U R\' U\' M\' R\' F R F\'', // 19
  'r U R\' U\' M2 U R U\' R\' U\' M\'', // 20
  'R U2 R\' U\' R U R\' U\' R U\' R\'', // 21
  'R U2 R2 U\' R2 U\' R2 U2 R', // 22
  'R2 D\' R U2 R\' D R U2 R', // 23
  'r U R\' U\' r\' F R F\'', // 24
  'F\' r U R\' U\' r\' F R', // 25
  'R U2 R\' U\' R U\' R\'', // 26
  'R U R\' U R U2 R\'', // 27
  'r U R\' U\' r\' R U R U\' R\'', // 28
  'R U R\' U\' R U\' R\' F\' U\' F R U R\'', // 29
  'F R\' F R2 U\' R\' U\' R U R\' F2', // 30
  'R\' U\' F U R U\' R\' F\' R', // 31
  'L U F\' U\' L\' U L F L\'', // 32
  'R U R\' U\' R\' F R F\'', // 33
  'R U R2 U\' R\' F R U R U\' F\'', // 34
  'R U2 R2 F R F\' R U2 R\'', // 35
  'L\' U\' L U\' L\' U L U L F\' L\' F', // 36
  'F R\' F\' R U R U\' R\'', // 37
  'R U R\' U R U\' R\' U\' R\' F R F\'', // 38
  'L F\' L\' U\' L U F U\' L\'', // 39
  'R\' F R U R\' U\' F\' U R', // 40
  'R U R\' U R U2 R\' F R U R\' U\' F\'', // 41
  'R\' U\' R U\' R\' U2 R F R U R\' U\' F\'', // 42
  'F\' U\' L\' U L F', // 43
  'F U R U\' R\' F\'', // 44
  'F R U R\' U\' F\'', // 45
  'R\' U\' R\' F R F\' U R', // 46
  'F\' L\' U\' L U L\' U\' L U F', // 47
  'F R U R\' U\' R U R\' U\' F\'', // 48
  'r U\' r2 U r2 U r2 U\' r', // 49
  'r\' U r2 U\' r2 U\' r2 U r\'', // 50
  'f R U R\' U\' R U R\' U\' f\'', // 51
  'R U R\' U R U\' B U\' B\' R\'', // 52
  'r\' U\' R U\' R\' U R U\' R\' U2 r', // 53
  'r U R\' U R U\' R\' U R U2 r\'', // 54
  'R U2 R2 U\' R U\' R\' U2 F R F\'', // 55
  'r U r\' U R U\' R\' U R U\' R\' r U\' r\'', // 56
  'R U R\' U\' M\' U R U\' r\'', // 57
];

/** PLL, the 21 named permutations (the solved/AUF class is not a case). */
export const PLL = [
  { name: 'Aa', alg: "x R' U R' D2 R U' R' D2 R2 x'" },
  { name: 'Ab', alg: "x R2 D2 R U R' D2 R U' R x'" },
  { name: 'E', alg: "x' R U' R' D R U R' D' R U R' D R U' R' D' x" },
  { name: 'F', alg: "R' U' F' R U R' U' R' F R2 U' R' U' R U R' U R" },
  { name: 'Ga', alg: "R2 U R' U R' U' R U' R2 U' D R' U R D'" },
  { name: 'Gb', alg: "R' U' R U D' R2 U R' U R U' R U' R2 D" },
  { name: 'Gc', alg: "R2 U' R U' R U R' U R2 U D' R U' R' D" },
  { name: 'Gd', alg: "R U R' U' D R2 U' R U' R' U R' U R2 D'" },
  { name: 'H', alg: 'M2 U M2 U2 M2 U M2' },
  { name: 'Ja', alg: "L U' R' U L' U2 R U' R' U2 R" },
  { name: 'Jb', alg: "R U R' F' R U R' U' R' F R2 U' R'" },
  { name: 'Na', alg: "R U R' U R U R' F' R U R' U' R' F R2 U' R' U2 R U' R'" },
  { name: 'Nb', alg: "R' U R U' R' F' U' F R U R' F R' F' R U' R" },
  { name: 'Ra', alg: "R U' R' U' R U R D R' U' R D' R' U2 R'" },
  { name: 'Rb', alg: "R2 F R U R U' R' F' R U2 R' U2 R" },
  { name: 'T', alg: "R U R' U' R' F R2 U' R' U' R U R' F'" },
  { name: 'Ua', alg: 'M2 U M U2 M\' U M2' },
  { name: 'Ub', alg: 'M2 U\' M U2 M\' U\' M2' },
  { name: 'V', alg: "R' U R' U' y R' F' R2 U' R' U R' F R F" },
  { name: 'Y', alg: "F R U' R' U' R U R' F' R U R' U' R' F R F'" },
  { name: 'Z', alg: "M' U M2 U M2 U M' U2 M2" },
];
