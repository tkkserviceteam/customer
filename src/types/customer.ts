export interface Customer {
  id: string;
  company_name: string;
  facility_name: string | null;
  facility_floor: string | null;
  contact_name: string;
  title: string | null;
  phone: string | null;
  extension: string | null;
  line_id: string | null;
  email: string | null;
  address: string | null; // <-- 新增這行
  notes: string | null;
  created_at: string;
}

export type InsertCustomerInput = Omit<Customer, 'id' | 'created_at'>;