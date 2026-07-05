export interface ChangeGroup {
  title: string;
  items: string[];
}

export interface DiffResult {
  summary: string[];
  groups: ChangeGroup[];
  unsupported: string[];
}
