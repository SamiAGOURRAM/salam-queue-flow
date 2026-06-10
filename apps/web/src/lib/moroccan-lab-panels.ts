export interface MoroccanLabPanelItem {
  testName: string;
  unit?: string;
  referenceRange?: string;
}

export const MOROCCAN_LAB_PANELS: MoroccanLabPanelItem[] = [
  { testName: 'NFS - Hemoglobine', unit: 'g/dL', referenceRange: 'F: 12 - 16 | H: 13 - 17' },
  { testName: 'NFS - Hematocrite', unit: '%', referenceRange: 'F: 36 - 46 | H: 40 - 52' },
  { testName: 'NFS - Globules rouges', unit: 'T/L', referenceRange: 'F: 4.0 - 5.2 | H: 4.5 - 5.9' },
  { testName: 'NFS - VGM', unit: 'fL', referenceRange: '80 - 100' },
  { testName: 'NFS - TCMH', unit: 'pg', referenceRange: '27 - 32' },
  { testName: 'NFS - CCMH', unit: 'g/dL', referenceRange: '32 - 36' },
  { testName: 'NFS - Leucocytes', unit: 'G/L', referenceRange: '4.0 - 10.0' },
  { testName: 'NFS - Neutrophiles', unit: 'G/L', referenceRange: '1.5 - 7.5' },
  { testName: 'NFS - Lymphocytes', unit: 'G/L', referenceRange: '1.0 - 4.0' },
  { testName: 'NFS - Plaquettes', unit: 'G/L', referenceRange: '150 - 400' },
  { testName: 'VS 1ere heure', unit: 'mm/h', referenceRange: 'F: < 20 | H: < 15' },
  { testName: 'Procalcitonine', unit: 'ng/mL', referenceRange: '< 0.1' },
  { testName: 'D-dimeres', unit: 'ng/mL FEU', referenceRange: '< 500' },
  { testName: 'Glycemie a jeun', unit: 'mg/dL', referenceRange: '70 - 110' },
  { testName: 'Glycemie post-prandiale', unit: 'mg/dL', referenceRange: '< 140' },
  { testName: 'HbA1c', unit: '%', referenceRange: '< 5.7' },
  { testName: 'Insuline', unit: 'uUI/mL', referenceRange: '2 - 25' },
  { testName: 'Creatinine serique', unit: 'mg/L', referenceRange: '7 - 13' },
  { testName: 'DFGe (CKD-EPI)', unit: 'mL/min/1.73m2', referenceRange: '> 90' },
  { testName: 'Uree', unit: 'g/L', referenceRange: '0.15 - 0.45' },
  { testName: 'Acide urique', unit: 'mg/L', referenceRange: 'F: 25 - 60 | H: 35 - 70' },
  { testName: 'Sodium', unit: 'mmol/L', referenceRange: '135 - 145' },
  { testName: 'Potassium', unit: 'mmol/L', referenceRange: '3.5 - 5.1' },
  { testName: 'Chlorures', unit: 'mmol/L', referenceRange: '98 - 107' },
  { testName: 'Calcium total', unit: 'mg/L', referenceRange: '85 - 105' },
  { testName: 'Phosphore', unit: 'mg/L', referenceRange: '25 - 45' },
  { testName: 'Magnesium', unit: 'mg/L', referenceRange: '16 - 26' },
  { testName: 'ASAT (TGO)', unit: 'UI/L', referenceRange: '< 35' },
  { testName: 'ALAT (TGP)', unit: 'UI/L', referenceRange: '< 45' },
  { testName: 'GGT', unit: 'UI/L', referenceRange: 'F: < 40 | H: < 60' },
  { testName: 'Phosphatases alcalines', unit: 'UI/L', referenceRange: '40 - 130' },
  { testName: 'Bilirubine totale', unit: 'mg/L', referenceRange: '3 - 12' },
  { testName: 'Bilirubine directe', unit: 'mg/L', referenceRange: '< 3' },
  { testName: 'Albumine', unit: 'g/L', referenceRange: '35 - 52' },
  { testName: 'Proteines totales', unit: 'g/L', referenceRange: '64 - 83' },
  { testName: 'Cholesterol total', unit: 'g/L', referenceRange: '< 2.00' },
  { testName: 'HDL cholesterol', unit: 'g/L', referenceRange: 'F: > 0.50 | H: > 0.40' },
  { testName: 'LDL cholesterol', unit: 'g/L', referenceRange: '< 1.30' },
  { testName: 'Triglycerides', unit: 'g/L', referenceRange: '< 1.50' },
  { testName: 'TSH ultra-sensible', unit: 'mUI/L', referenceRange: '0.4 - 4.0' },
  { testName: 'FT4', unit: 'pmol/L', referenceRange: '9 - 19' },
  { testName: 'FT3', unit: 'pmol/L', referenceRange: '3.5 - 6.5' },
  { testName: 'CRP', unit: 'mg/L', referenceRange: '< 6' },
  { testName: 'Ferritine', unit: 'ng/mL', referenceRange: '20 - 300' },
  { testName: 'Fer serique', unit: 'ug/dL', referenceRange: '50 - 170' },
  { testName: 'Transferrine', unit: 'g/L', referenceRange: '2.0 - 3.6' },
  { testName: 'Vitamine B12', unit: 'pg/mL', referenceRange: '200 - 900' },
  { testName: 'Folates', unit: 'ng/mL', referenceRange: '> 4' },
  { testName: 'TP / INR', unit: 'ratio', referenceRange: '0.8 - 1.2' },
  { testName: 'TCA (aPTT)', unit: 's', referenceRange: '25 - 35' },
  { testName: 'ECBU - Leucocytes', unit: '/mL', referenceRange: '< 10000' },
  { testName: 'ECBU - Hematies', unit: '/mL', referenceRange: '< 10000' },
];

export function findLabPanelByName(testName: string): MoroccanLabPanelItem | undefined {
  const normalized = testName.trim().toLowerCase();
  return MOROCCAN_LAB_PANELS.find((item) => item.testName.toLowerCase() === normalized);
}

export function searchLabPanelSuggestions(query: string, limit: number = 10): MoroccanLabPanelItem[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return MOROCCAN_LAB_PANELS.slice(0, limit);
  }

  return MOROCCAN_LAB_PANELS.filter((item) => item.testName.toLowerCase().includes(normalized)).slice(0, limit);
}
