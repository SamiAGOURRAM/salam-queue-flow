/**
 * Resource Registry
 * 
 * Central registration point for all MCP resources.
 * Resources are static or dynamic content that can be read by AI assistants.
 */

import { Resource } from "@modelcontextprotocol/sdk/types.js";
import { logger } from "../utils/logger.js";
import { NotFoundError } from "../utils/errors.js";

// ============================================
// RESOURCE DEFINITIONS
// ============================================

const resources: Resource[] = [
  {
    uri: "queuemed://policies/emergency",
    name: "Emergency Guidance - Morocco",
    description: "Emergency contact numbers and triage guidance for Morocco",
    mimeType: "text/markdown",
  },
  {
    uri: "queuemed://policies/privacy",
    name: "Privacy Policy",
    description: "QueueMed data privacy and security policy",
    mimeType: "text/markdown",
  },
  {
    uri: "queuemed://policies/disclaimer",
    name: "Medical Disclaimer",
    description: "Important disclaimer about AI-provided health information",
    mimeType: "text/markdown",
  },
  {
    uri: "queuemed://schemas/appointment-types",
    name: "Appointment Types",
    description: "Standard appointment types and their typical durations",
    mimeType: "application/json",
  },
  {
    uri: "queuemed://schemas/specialties",
    name: "Medical Specialties",
    description: "List of supported medical specialties in Morocco",
    mimeType: "application/json",
  },
];

// ============================================
// RESOURCE CONTENTS
// ============================================

const resourceContents: Record<string, string> = {
  "queuemed://policies/emergency": `# 🚨 Emergency Guidance - Morocco

## Emergency Numbers (Numéros d'urgence)

| Service | Number | Description |
|---------|--------|-------------|
| **SAMU** | **141** | Emergency Medical Services (الإسعاف الطبي) |
| **Police** | **19** | Police Emergency (الشرطة) |
| **Fire/Civil Protection** | **15** | Fire and Rescue (الوقاية المدنية) |
| **Royal Gendarmerie** | **177** | Rural areas (الدرك الملكي) |
| **SOS Médecins Casablanca** | **0522 252 525** | Home doctor visits |
| **SOS Médecins Rabat** | **0537 202 020** | Home doctor visits |

## When to Seek Emergency Care

Seek **immediate emergency care** (call 141 or go to urgences) if you experience:

- 🫀 Chest pain or pressure
- 😮‍💨 Severe difficulty breathing
- 🩸 Heavy or uncontrolled bleeding
- 🧠 Sudden confusion, difficulty speaking, or facial drooping (signs of stroke)
- 🤕 Loss of consciousness
- 🤒 High fever (>39°C) with confusion or stiff neck
- ⚡ Severe allergic reaction (swelling, difficulty breathing)
- 🤰 Pregnancy complications (severe pain, heavy bleeding)

## ⚠️ Important Notice

This AI assistant provides **general healthcare information only**. It is:
- NOT a substitute for professional medical advice
- NOT able to diagnose conditions
- NOT able to prescribe medications

**Always consult a qualified healthcare provider for medical concerns.**

---
*QueueMed - Transforming Moroccan Healthcare (تحويل الرعاية الصحية المغربية)*
`,

  "queuemed://policies/privacy": `# 🔒 Privacy Policy - QueueMed

## Data We Collect

QueueMed collects only the minimum data necessary to provide our services:

### Personal Information
- Phone number (for authentication and notifications)
- Full name (for appointment identification)
- City (for clinic recommendations)

### Health Information
- Appointment history
- Queue position data
- Visit timestamps

### Usage Data
- Chat interactions (anonymized for service improvement)
- Feature usage patterns

## How We Protect Your Data

- 🔐 **Encryption**: All data is encrypted in transit (TLS 1.3) and at rest
- 🏥 **Healthcare Compliance**: We follow Moroccan healthcare data regulations
- 🔑 **Access Control**: Strict role-based access to patient data
- 📝 **Audit Logging**: All data access is logged and auditable
- 🗑️ **Data Retention**: Data is retained only as long as necessary

## Your Rights

You have the right to:
- Access your personal data
- Correct inaccurate data
- Delete your account and data
- Export your data
- Opt out of non-essential communications

## Data Sharing

We **never** share your personal health information with:
- Advertisers
- Data brokers
- Third parties without your explicit consent

We may share anonymized, aggregated data for:
- Service improvement
- Healthcare research (with ethics approval)

## Contact

For privacy concerns, contact: privacy@queuemed.ma

---
*Last updated: January 2025*
`,

  "queuemed://policies/disclaimer": `# ⚠️ Medical Disclaimer

## Important Notice

The QueueMed AI Assistant is designed to help you:
- Find healthcare clinics
- Book appointments
- Track queue positions
- Get general health information

## Limitations

This AI assistant:

❌ **CANNOT** diagnose medical conditions
❌ **CANNOT** prescribe medications
❌ **CANNOT** replace professional medical advice
❌ **CANNOT** provide emergency medical guidance

## When to Seek Professional Care

Always consult a healthcare professional if you:
- Have symptoms that concern you
- Need medical diagnosis or treatment
- Have questions about medications
- Experience any medical emergency

## Emergency Situations

**For medical emergencies, call SAMU immediately: 141**

Do not use this AI assistant for emergency medical situations.

## Accuracy

While we strive for accuracy, health information provided is:
- For educational purposes only
- May not be complete or up-to-date
- Should not be the sole basis for health decisions

## Your Responsibility

By using QueueMed, you acknowledge that:
- You will seek professional medical advice for health concerns
- You will not rely solely on AI-provided information
- You will call emergency services for urgent medical needs

---
*QueueMed - Your Health, Your Responsibility*
`,

  "queuemed://schemas/appointment-types": JSON.stringify(
    {
      appointmentTypes: [
        {
          name: "consultation",
          label: "Consultation",
          labelAr: "استشارة",
          labelFr: "Consultation",
          description: "Initial or general consultation with a doctor",
          typicalDuration: 15,
          minDuration: 10,
          maxDuration: 30,
        },
        {
          name: "follow_up",
          label: "Follow-up",
          labelAr: "متابعة",
          labelFr: "Suivi",
          description: "Follow-up visit for ongoing treatment",
          typicalDuration: 10,
          minDuration: 5,
          maxDuration: 20,
        },
        {
          name: "checkup",
          label: "Checkup",
          labelAr: "فحص",
          labelFr: "Bilan",
          description: "Routine health checkup",
          typicalDuration: 15,
          minDuration: 10,
          maxDuration: 30,
        },
        {
          name: "procedure",
          label: "Procedure",
          labelAr: "إجراء طبي",
          labelFr: "Procédure",
          description: "Minor medical procedure",
          typicalDuration: 30,
          minDuration: 15,
          maxDuration: 60,
        },
        {
          name: "vaccination",
          label: "Vaccination",
          labelAr: "تلقيح",
          labelFr: "Vaccination",
          description: "Vaccine administration",
          typicalDuration: 10,
          minDuration: 5,
          maxDuration: 15,
        },
      ],
    },
    null,
    2
  ),

  "queuemed://schemas/specialties": JSON.stringify(
    {
      specialties: [
        { name: "general", label: "Médecine Générale", labelAr: "طب عام" },
        { name: "dermatology", label: "Dermatologie", labelAr: "أمراض الجلد" },
        { name: "cardiology", label: "Cardiologie", labelAr: "أمراض القلب" },
        { name: "pediatrics", label: "Pédiatrie", labelAr: "طب الأطفال" },
        { name: "gynecology", label: "Gynécologie", labelAr: "أمراض النساء" },
        { name: "ophthalmology", label: "Ophtalmologie", labelAr: "طب العيون" },
        { name: "dentistry", label: "Dentiste", labelAr: "طب الأسنان" },
        { name: "orthopedics", label: "Orthopédie", labelAr: "جراحة العظام" },
        { name: "neurology", label: "Neurologie", labelAr: "أمراض الأعصاب" },
        { name: "psychiatry", label: "Psychiatrie", labelAr: "الطب النفسي" },
        { name: "ent", label: "ORL", labelAr: "أنف أذن حنجرة" },
        { name: "gastroenterology", label: "Gastro-entérologie", labelAr: "أمراض الجهاز الهضمي" },
        { name: "pulmonology", label: "Pneumologie", labelAr: "أمراض الرئة" },
        { name: "endocrinology", label: "Endocrinologie", labelAr: "الغدد الصماء" },
        { name: "rheumatology", label: "Rhumatologie", labelAr: "أمراض الروماتيزم" },
        { name: "urology", label: "Urologie", labelAr: "المسالك البولية" },
        { name: "nephrology", label: "Néphrologie", labelAr: "أمراض الكلى" },
        { name: "radiology", label: "Radiologie", labelAr: "الأشعة" },
        { name: "laboratory", label: "Laboratoire", labelAr: "مختبر التحاليل" },
      ],
    },
    null,
    2
  ),
};

// ============================================
// PUBLIC API
// ============================================

/**
 * Get all registered resources
 */
export function registerResources(): Resource[] {
  logger.debug("Registering resources", { count: resources.length });
  return resources;
}

/**
 * Get resource content by URI
 */
export function getResource(uri: string): {
  contents: Array<{ uri: string; mimeType: string; text: string }>;
} {
  const content = resourceContents[uri];

  if (!content) {
    logger.warn("Resource not found", { uri });
    throw new NotFoundError("Resource", uri);
  }

  const resource = resources.find((r) => r.uri === uri);

  logger.debug("Resource retrieved", { uri });

  return {
    contents: [
      {
        uri,
        mimeType: resource?.mimeType || "text/plain",
        text: content,
      },
    ],
  };
}

/**
 * Check if a resource exists
 */
export function hasResource(uri: string): boolean {
  return uri in resourceContents;
}

