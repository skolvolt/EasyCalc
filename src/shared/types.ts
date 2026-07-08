export interface ProjectDetails {
  workbook_version: string | number | null;
  project_name: string | null;
  project_number: string | number | null;
  /** Revision/version for the standardised export filename (e.g. "1" -> V1). */
  version?: string | number | null;
  date: string | null;
  client_name: string | null;
  client_address: string | null;
  client_city: string | null;
  client_site: string | null;
  purpose: string | null;
  summary: string | null;
  /** Name of the person who prepared the quote — stamped on exported PDFs. */
  quoted_by?: string | null;
  /** Free-text notes shown on the Room Summary tab and atop summary/room PDFs. */
  room_summary_notes?: string | null;
  /** Floorplan image (data URL) — printed centred on summary/room PDFs. */
  floorplan_image?: string | null;
  gst: number;
  /** @deprecated legacy single-logo field — migrated to client_logo on load */
  logo?: string | null;
  /** Client branding (data URL) — display-only beside the project title; never printed */
  client_logo?: string | null;
  /** Your company logo (data URL) — the PDF letterhead */
  company_logo?: string | null;
  /** Your company details — printed as the letterhead on PDFs and Excels. */
  company_name?: string | null;
  company_phone?: string | null;
  company_address?: string | null;
  company_website?: string | null;
  /** Display currency code (ISO 4217). Values are stored in AUD base. */
  currency?: string;
}

export interface Category {
  name: string;
  contingency: number;
}

export interface RoomType {
  idx: number;
  name: string;
  class: 'Standard' | 'Unique';
  /** Per-room-type rich-text (HTML) notes, shown on this room's invoice/BoM. */
  notes?: string | null;
  /** Per-room-type floorplan image (data URL), printed on this room's invoice. */
  floorplan?: string | null;
}

export interface Room {
  level: string | number | null;
  area: string | null;
  room_no: string | number | null;
  types: { type_idx: number; qty: number }[];
}

export interface CatalogueItem {
  row: number; // original workbook row, stable id within seed
  section: string | null;
  subcategory: string | null;
  description: string | null;
  part_number: string | null;
  power_load: number | null;
  dimensions: string | null;
  warranty: string | null;
  manufacturer: string | null;
  supplier: string | null;
  measurement: string | null;
  cost: number | null;
  markup: number | null;
  allocations: Record<string, number>; // type idx -> qty per room
}

export type LmKind = 'labour' | 'cable' | 'part';

export interface LmItem {
  row: number;
  kind: LmKind;
  category: string | null;
  component: string | null;
  particular: string | null;
  brand: string | null;
  measurement: string | null;
  cost: number | null;
  markup_entered: number | null; // cables/parts enter markup, sell derived
  sell_entered: number | null;   // labour enters sell, markup derived
  allocations: Record<string, number>;
}

export interface ProjectState {
  details: ProjectDetails;
  categories: Category[];
  room_types: RoomType[];
  rooms: Room[];
  catalogue: CatalogueItem[];
  labour_materials: LmItem[];
  /** supplier name -> pricelist file path on this machine */
  supplier_pricelists?: Record<string, string>;
  /** Rich-text (HTML) notes for the Notes page — saved with the project. */
  notes_html?: string | null;
  /**
   * Persisted per-cell value history (cell key -> earlier values, newest first).
   * `by` is the Windows account that made the change. Kept out of the undo
   * stack; hydrated on open and re-attached on save so it accumulates across
   * sessions for the life of the project.
   */
  cell_history?: Record<string, { value: number; ts: number; by?: string }[]>;
}
