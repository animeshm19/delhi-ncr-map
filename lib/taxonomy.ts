import type { Kind } from "./types";

export const SECTORS: Record<string, { label: string; color: string }> = {
  fintech: { label: "Fintech", color: "#4cc9f0" },
  insurtech: { label: "Insurtech", color: "#4895ef" },
  "travel-hospitality": { label: "Travel & Hospitality", color: "#f72585" },
  "logistics-mobility": { label: "Logistics & Mobility", color: "#f8961e" },
  "commerce-marketplaces": { label: "Commerce & Marketplaces", color: "#f9c74f" },
  "food-quick-commerce": { label: "Food & Quick Commerce", color: "#ff6b6b" },
  "consumer-services": { label: "Consumer Services", color: "#90be6d" },
  "enterprise-saas": { label: "Enterprise SaaS", color: "#43aa8b" },
  "ai-ml": { label: "AI/ML", color: "#b388ff" },
  "health-biotech": { label: "Health & Biotech", color: "#06d6a0" },
  edtech: { label: "Edtech", color: "#ffd166" },
  "proptech-construction": { label: "Proptech & Construction", color: "#c08552" },
  "hardware-robotics": { label: "Hardware & Robotics", color: "#adb5bd" },
  "ev-cleantech": { label: "EV & Cleantech", color: "#52b788" },
  "agri-climate": { label: "Agritech & Climate", color: "#a7c957" },
  gaming: { label: "Gaming & Interactive", color: "#e76f51" },
};

export const KINDS: Record<Kind, { label: string; plural: string; color: string }> = {
  company: { label: "Company", plural: "Companies", color: "#e9ecef" },
  accelerator: { label: "Accelerator", plural: "Accelerators & incubators", color: "#ffbe0b" },
  investor: { label: "Investor", plural: "Investors", color: "#fb5607" },
  coworking: { label: "Coworking", plural: "Coworking & hubs", color: "#3a86ff" },
  university_research: { label: "Research", plural: "Universities & research", color: "#8338ec" },
  government_program: { label: "Program", plural: "Government & non-profit programs", color: "#ff006e" },
  community_group: { label: "Community group", plural: "Community groups", color: "#2ec4b6" },
};

export function sectorColor(slug?: string) {
  return (slug && SECTORS[slug]?.color) || "#e9ecef";
}

export function sectorLabel(slug: string) {
  return SECTORS[slug]?.label ?? slug;
}
