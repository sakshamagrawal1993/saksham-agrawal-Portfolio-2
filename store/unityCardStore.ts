import { create } from 'zustand';

interface UnityCardState {
  phone: string;
  fullName: string;
  dob: string;
  pan: string;
  employmentType: string;
  annualIncome: string;
  email: string;
  aadhaar: string;
  address: string;
  nameOnCard: string;
  pepDeclaration: boolean;
  creditLimit: number | null;

  setPhone: (phone: string) => void;
  setPanDetails: (pan: string, fullName: string, dob: string) => void;
  setEmploymentDetails: (employmentType: string, annualIncome: string) => void;
  setEmail: (email: string) => void;
  setAadhaar: (aadhaar: string) => void;
  setAddress: (address: string) => void;
  setCustomization: (nameOnCard: string, pepDeclaration: boolean) => void;
  setCreditLimit: (limit: number) => void;
  reset: () => void;
}

export const useUnityCardStore = create<UnityCardState>((set) => ({
  phone: '',
  fullName: '',
  dob: '',
  pan: '',
  employmentType: '',
  annualIncome: '',
  email: '',
  aadhaar: '',
  address: '',
  nameOnCard: '',
  pepDeclaration: false,
  creditLimit: null,

  setPhone: (phone) => set({ phone }),
  setPanDetails: (pan, fullName, dob) => set({ pan, fullName, dob }),
  setEmploymentDetails: (employmentType, annualIncome) => set({ employmentType, annualIncome }),
  setEmail: (email) => set({ email }),
  setAadhaar: (aadhaar) => set({ aadhaar }),
  setAddress: (address) => set({ address }),
  setCustomization: (nameOnCard, pepDeclaration) => set({ nameOnCard, pepDeclaration }),
  setCreditLimit: (creditLimit) => set({ creditLimit }),
  reset: () => set({ 
    phone: '', fullName: '', dob: '', pan: '', employmentType: '', annualIncome: '', 
    email: '', aadhaar: '', address: '', nameOnCard: '', pepDeclaration: false, creditLimit: null 
  }),
}));
