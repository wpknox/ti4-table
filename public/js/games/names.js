// Faction ids and display names for the games section. Pure data (no DOM), so
// stats.js, validate.js and the Node checks can import it. The ids are the ones
// the validator accepts and match public/img/factions/<id>.svg; the names are the F_* page titles in
// rules.json, with the Firmament / Obsidian page split in two. A static list
// keeps the form working offline without loading all of rules.json.
export const FACTION_NAMES = {
  F_arborec: "The Arborec", F_argent: "The Argent Flight", F_bastion: "Last Bastion",
  F_creuss: "The Ghosts of Creuss", F_deepwrought: "The Deepwrought Scholarate",
  F_empyrean: "The Empyrean", F_firmament: "The Firmament", F_obsidian: "The Obsidian",
  F_hacan: "The Emirates of Hacan", F_jol_nar: "The Universities of Jol-Nar",
  F_keleres: "Council Keleres", F_letnev: "The Barony of Letnev", F_lizix: "The L1Z1X Mindnet",
  F_mahact: "The Mahact Gene-Sorcerers", F_mentak: "The Mentak Coalition",
  F_muaat: "The Embers of Muaat", F_naalu: "The Naalu Collective",
  F_naaz_rokha: "The Naaz-Rokha Alliance", F_nekro: "The Nekro Virus", F_nomad: "The Nomad",
  F_norr: "Sardakk N'orr", F_ral_nel: "The Ral Nel Consortium", F_rebellion: "The Crimson Rebellion",
  F_saar: "The Clan of Saar", F_sol: "The Federation of Sol", F_ul: "The Titans of Ul",
  F_vuilraith: "The Vuil'raith Cabal", F_winnu: "The Winnu", F_xxcha: "The Xxcha Kingdom",
  F_yin: "The Yin Brotherhood", F_yssaril: "The Yssaril Tribes",
};
export const FACTION_IDS = Object.keys(FACTION_NAMES);
export const NO_FACTION = "Faction not picked";
// A planned seat can have no faction yet.
export const factionName = (id) => (id ? FACTION_NAMES[id] ?? id : NO_FACTION);
export const COLORS = ["black", "blue", "green", "orange", "pink", "purple", "red", "yellow"];
