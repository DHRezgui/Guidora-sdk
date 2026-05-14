/**
 * Healthtech pack — patient record, appointment booking, medical history,
 * prescription renewal.
 *
 * ⚠ Maturity: PREVIEW. Healthcare UX is heavily regulated (HIPAA in the US,
 * GDPR-health in the EU, with national overlays like HDS in France) and the
 * vocabulary is BOTH locale-specific and category-specific:
 *  - "Patient" (US) vs "Assuré social" (FR insurance-side) vs "Versicherter" (DE)
 *  - "Appointment" (US) vs "Rendez-vous" / "Consultation" (FR) vs "Termin" (DE)
 *  - Prescription codes, dosage UI, vital-signs widgets vary drastically
 *
 * Before publishing tours from this pack on a production healthtech app,
 * we STRONGLY recommend:
 *  1. Keeping `saved_pending_review_policy_guard` enabled (default)
 *  2. Manually validating EACH draft on a real customer app
 *  3. Adding HIPAA-/GDPR-aware copy review to the content pipeline
 */

import { JourneyBlueprint } from '../../../types';

const HEALTHTECH_PATIENT_JOURNEY: JourneyBlueprint = {
  id: 'healthtech.patient-journey',
  name: 'Parcours patient - prise en main de l espace sante',
  description:
    "Guide un patient dans son portail: consulter son dossier, prendre un rendez-vous, voir son historique medical, demander le renouvellement d'une ordonnance.",
  vertical: 'healthtech',
  intent: 'support-navigation',
  minResolvedSteps: 2,
  priority: 10,
  steps: [
    {
      semanticRole: 'healthtech.patient-record',
      title: 'Consultez votre dossier',
      description:
        "Le dossier patient regroupe vos informations personnelles, vos allergies, vos antecedents et vos pathologies en cours. Verifiez qu'il est a jour.",
      position: 'BOTTOM',
      action: 'CLICK',
      required: true,
      targetHints: {
        routePatterns: [
          '/patient', '/health-record', '/my-health', '/dossier',
          '/dossier-patient', '/dossier-medical', '/mes-donnees-sante',
          '/expediente', '/historia-clinica',
          '/patientenakte', '/gesundheitsakte',
          '/cartella-clinica', '/anagrafica',
          '/prontuario', '/registro-medico',
        ],
        selectorHints: [
          '[data-tour-id="patient-record"]',
          '[data-tour-id="health-record"]',
          '[data-tour-id*="patient-file"]',
          '[data-tour-id*="medical-record"]',
          'a[href*="/patient"]',
          'a[href*="/health-record"]',
          'a[href*="/dossier"]',
          'a[href*="/expediente"]',
          'a[href*="/patientenakte"]',
          'a[href*="/cartella"]',
          'a[href*="/prontuario"]',
          'section[class*="patient-record"]',
          'section[class*="PatientRecord"]',
          'section[class*="HealthRecord"]',
        ],
        semanticTokens: [
          'patient', 'health record', 'medical file', 'my health',
          'patient', 'dossier medical', 'mes donnees',
          'paciente', 'historia clinica', 'expediente',
          'patient', 'patientenakte', 'gesundheitsakte',
          'paziente', 'cartella clinica',
          'paciente', 'prontuario', 'historico',
        ],
        actionVerbs: [
          'view record', 'open medical file',
          'consulter dossier', 'ouvrir mon dossier',
          'ver expediente',
          'akte ansehen',
          'visualizza cartella',
          'ver prontuario',
        ],
        elementTags: ['a', 'button'],
      },
    },
    {
      semanticRole: 'healthtech.book-appointment',
      title: 'Prenez un rendez-vous',
      description:
        "Choisissez un praticien, une date et un creneau. La confirmation arrive par email; pensez a verifier votre couverture si necessaire.",
      position: 'BOTTOM',
      action: 'CLICK',
      targetHints: {
        routePatterns: [
          '/appointment', '/book', '/booking', '/schedule',
          '/rendez-vous', '/prendre-rdv', '/reserver',
          '/cita', '/agendar', '/reservar',
          '/termin', '/termin-buchen', '/buchen',
          '/appuntamento', '/prenota',
          '/agendamento', '/consulta', '/marcar',
        ],
        selectorHints: [
          '[data-tour-id="book-appointment"]',
          '[data-tour-id="new-appointment"]',
          '[data-tour-id*="appointment"]',
          '[data-tour-id*="booking"]',
          'a[href*="/appointment"]',
          'a[href*="/booking"]',
          'a[href*="/rendez-vous"]',
          'a[href*="/cita"]',
          'a[href*="/termin"]',
          'a[href*="/appuntamento"]',
          'a[href*="/agendamento"]',
          'a[href*="/consulta"]',
          'button[class*="book-button"]',
          'button[class*="BookButton"]',
          'button[class*="ScheduleAppointment"]',
          'form[aria-label*="appointment" i]',
        ],
        semanticTokens: [
          'appointment', 'booking', 'schedule', 'consultation',
          'rendez-vous', 'reservation', 'consultation',
          'cita', 'reserva', 'consulta',
          'termin', 'buchung',
          'appuntamento', 'prenotazione',
          'agendamento', 'consulta',
        ],
        actionVerbs: [
          'book appointment', 'schedule visit', 'new appointment',
          'prendre rendez-vous', 'reserver',
          'reservar cita', 'agendar consulta',
          'termin buchen', 'termin vereinbaren',
          'prenota appuntamento',
          'agendar consulta', 'marcar consulta',
        ],
        elementTags: ['a', 'button', 'form'],
      },
    },
    {
      semanticRole: 'healthtech.medical-history',
      title: 'Consultez votre historique',
      description:
        "L'historique medical liste vos consultations passees, vos examens et leurs resultats. Pratique pour un suivi a long terme.",
      position: 'RIGHT',
      action: 'CLICK',
      targetHints: {
        routePatterns: [
          '/history', '/medical-history', '/consultations', '/results',
          '/historique', '/historique-medical', '/consultations', '/resultats',
          '/historial', '/historial-medico', '/resultados',
          '/verlauf', '/krankengeschichte', '/befunde',
          '/storia-clinica', '/anamnesi', '/risultati',
          '/historico', '/historico-medico', '/resultados',
        ],
        selectorHints: [
          '[data-tour-id="medical-history"]',
          '[data-tour-id="health-history"]',
          '[data-tour-id*="history"]',
          '[data-tour-id*="consultations"]',
          'a[href*="/history"]',
          'a[href*="/historique"]',
          'a[href*="/historial"]',
          'a[href*="/krankengeschichte"]',
          'a[href*="/anamnesi"]',
          'a[href*="/historico"]',
        ],
        semanticTokens: [
          'history', 'medical history', 'consultations', 'results',
          'historique', 'consultations', 'resultats',
          'historial', 'historia clinica', 'resultados',
          'verlauf', 'krankengeschichte', 'befunde',
          'storia clinica', 'anamnesi', 'risultati',
          'historico', 'historia clinica', 'resultados',
        ],
        elementTags: ['a', 'button'],
      },
    },
    {
      semanticRole: 'healthtech.prescription-renewal',
      title: 'Demandez le renouvellement d une ordonnance',
      description:
        "Pour un traitement de fond, vous pouvez demander a votre praticien le renouvellement en ligne, sans passer par une consultation.",
      position: 'BOTTOM',
      action: 'CLICK',
      targetHints: {
        routePatterns: [
          '/prescription', '/refill', '/prescription-renewal',
          '/ordonnance', '/renouvellement', '/renouveler-ordonnance',
          '/receta', '/renovacion-receta',
          '/rezept', '/folgerezept',
          '/ricetta', '/rinnovo-ricetta',
          '/receita', '/renovacao-receita',
        ],
        selectorHints: [
          '[data-tour-id="prescription"]',
          '[data-tour-id="refill"]',
          '[data-tour-id="renew-prescription"]',
          '[data-tour-id*="prescription"]',
          '[data-tour-id*="refill"]',
          '[data-tour-id*="renewal"]',
          'a[href*="/prescription"]',
          'a[href*="/refill"]',
          'a[href*="/ordonnance"]',
          'a[href*="/renouvellement"]',
          'a[href*="/receta"]',
          'a[href*="/rezept"]',
          'a[href*="/ricetta"]',
          'a[href*="/receita"]',
          'button[class*="renew-prescription"]',
          'button[class*="RenewPrescription"]',
        ],
        semanticTokens: [
          'prescription', 'refill', 'medication', 'renew',
          'ordonnance', 'renouvellement', 'medicament',
          'receta', 'renovacion', 'medicamento',
          'rezept', 'folgerezept', 'medikament',
          'ricetta', 'rinnovo', 'farmaco',
          'receita', 'renovacao', 'medicamento',
        ],
        actionVerbs: [
          'renew prescription', 'request refill',
          'renouveler ordonnance', 'demander renouvellement',
          'renovar receta', 'solicitar renovacion',
          'rezept verlangern',
          'rinnova ricetta',
          'renovar receita',
        ],
        elementTags: ['a', 'button'],
      },
    },
  ],
};

const HEALTHTECH_MANAGEMENT_DASHBOARD: JourneyBlueprint = {
  id: 'healthtech.management-dashboard',
  name: 'Pilotage operationnel sante',
  description:
    "Guide un administrateur dans un tableau de bord sante: indicateurs patients, reseau d'etablissements, pharmacie/inventaire et rapports.",
  vertical: 'healthtech',
  intent: 'primary-action',
  minResolvedSteps: 2,
  priority: 9,
  steps: [
    {
      semanticRole: 'healthtech.management-dashboard',
      title: 'Visualisez le tableau de bord sante',
      description:
        "Le tableau de bord regroupe les indicateurs cles: patients, pharmacies, etablissements et revenus. C'est le point de depart du pilotage.",
      position: 'BOTTOM',
      action: 'NEXT',
      required: true,
      targetHints: {
        routePatterns: [
          '/', '/dashboard', '/overview', '/healthcare', '/management',
          '/admin', '/operations', '/pilotage',
        ],
        selectorHints: [
          '[data-tour-id="healthcare-dashboard"]',
          '[data-tour-id="management-dashboard"]',
          '[data-tour-id*="healthcare"]',
          '[data-tour-id*="dashboard"]',
          'main h1',
          'button[role="tab"]',
          'section[aria-label*="healthcare" i]',
          'section[aria-label*="dashboard" i]',
          'div[aria-label*="healthcare" i]',
          'div[aria-label*="dashboard" i]',
        ],
        semanticTokens: [
          'healthcare management dashboard', 'healthcare management',
          'dashboard', 'overview', 'total patients', 'pharmacy items',
          'facilities', 'hospitals', 'clinics',
          'tableau de bord sante', 'gestion sante', 'patients',
          'etablissements', 'pharmacies', 'cliniques', 'hopitaux',
        ],
        elementTags: ['button', 'div', 'section', 'article'],
      },
    },
    {
      semanticRole: 'healthtech.patient-analytics',
      title: 'Suivez les patients',
      description:
        "L'espace patients permet de consulter les volumes, statistiques et informations de suivi utiles aux equipes de soins.",
      position: 'BOTTOM',
      action: 'CLICK',
      targetHints: {
        routePatterns: [
          '/patients', '/patient', '/people', '/records',
          '/patients', '/dossiers',
        ],
        selectorHints: [
          '[data-tour-id="patients"]',
          '[data-tour-id="patient-records"]',
          '[data-tour-id*="patient"]',
          'a[href*="/patients"]',
          'a[href*="/patient"]',
          'button[role="tab"]',
          'section[aria-label*="patient" i]',
          'div[aria-label*="patient" i]',
        ],
        semanticTokens: [
          'patients', 'patient records', 'patient information',
          'patient statistics', 'patient visits', 'patient demographics',
          'patients', 'dossiers patients', 'statistiques patients',
        ],
        actionVerbs: [
          'view patients', 'manage patients', 'open patient records',
          'consulter patients', 'gerer patients',
        ],
        elementTags: ['a', 'button', 'div', 'section', 'article'],
      },
    },
    {
      semanticRole: 'healthtech.pharmacy-inventory',
      title: 'Gerez la pharmacie',
      description:
        "Le module pharmacie sert a suivre les articles, les stocks et l'inventaire sur les differentes localisations.",
      position: 'BOTTOM',
      action: 'CLICK',
      targetHints: {
        routePatterns: [
          '/pharmacy', '/inventory', '/medications', '/stock',
          '/pharmacie', '/inventaire', '/medicaments',
        ],
        selectorHints: [
          '[data-tour-id="pharmacy"]',
          '[data-tour-id="inventory"]',
          '[data-tour-id*="pharmacy"]',
          '[data-tour-id*="inventory"]',
          'a[href*="/pharmacy"]',
          'a[href*="/inventory"]',
          'button[role="tab"]',
          'section[aria-label*="pharmacy" i]',
          'section[aria-label*="inventory" i]',
          'div[aria-label*="pharmacy" i]',
          'div[aria-label*="inventory" i]',
        ],
        semanticTokens: [
          'pharmacy', 'pharmacy items', 'inventory', 'inventory status',
          'medications', 'drugstores', 'stock levels',
          'pharmacie', 'inventaire', 'medicaments', 'stock',
        ],
        actionVerbs: [
          'manage pharmacy', 'view inventory', 'manage inventory',
          'gerer pharmacie', 'consulter inventaire',
        ],
        elementTags: ['a', 'button', 'div', 'section', 'article'],
      },
    },
    {
      semanticRole: 'healthtech.facility-management',
      title: 'Pilotez les etablissements',
      description:
        "La vue etablissements donne la repartition des hopitaux, cliniques et pharmacies du reseau pour comparer les capacites.",
      position: 'RIGHT',
      action: 'CLICK',
      targetHints: {
        routePatterns: [
          '/facilities', '/facility', '/locations', '/clinics', '/hospitals',
          '/etablissements', '/cliniques', '/hopitaux',
        ],
        selectorHints: [
          '[data-tour-id="facilities"]',
          '[data-tour-id="facility-overview"]',
          '[data-tour-id*="facility"]',
          'a[href*="/facilities"]',
          'a[href*="/clinics"]',
          'a[href*="/hospitals"]',
          'button[role="tab"]',
          'section[aria-label*="facility" i]',
          'section[aria-label*="clinic" i]',
          'section[aria-label*="hospital" i]',
          'div[aria-label*="facility" i]',
        ],
        semanticTokens: [
          'facilities', 'facility overview', 'facility types',
          'hospitals', 'clinics', 'pharmacies', 'locations',
          'etablissements', 'hopitaux', 'cliniques', 'pharmacies',
        ],
        actionVerbs: [
          'manage facilities', 'view facilities',
          'gerer etablissements', 'voir etablissements',
        ],
        elementTags: ['a', 'button', 'div', 'section', 'article'],
      },
    },
    {
      semanticRole: 'healthtech.healthcare-reports',
      title: 'Generez des rapports',
      description:
        "Le centre de rapports consolide les donnees patients, finance, inventaire et performance pour le pilotage operationnel.",
      position: 'BOTTOM',
      action: 'CLICK',
      targetHints: {
        routePatterns: [
          '/reports', '/reporting', '/analytics', '/insights',
          '/rapports', '/analyse',
        ],
        selectorHints: [
          '[data-tour-id="reports"]',
          '[data-tour-id="report-generator"]',
          '[data-tour-id*="report"]',
          'a[href*="/reports"]',
          'a[href*="/analytics"]',
          'button[role="tab"]',
          'button[aria-label*="report" i]',
          'section[aria-label*="report" i]',
          'div[aria-label*="report" i]',
        ],
        semanticTokens: [
          'reports', 'reports center', 'generate reports',
          'report generator', 'daily reports', 'weekly reports',
          'monthly reports', 'patient statistics', 'financial summary',
          'rapports', 'generer rapports', 'centre de rapports',
        ],
        actionVerbs: [
          'generate report', 'new report', 'view reports',
          'generer rapport', 'nouveau rapport',
        ],
        elementTags: ['a', 'button', 'div', 'section', 'article'],
      },
    },
  ],
};

export const healthtechBlueprints: JourneyBlueprint[] = [
  HEALTHTECH_PATIENT_JOURNEY,
  HEALTHTECH_MANAGEMENT_DASHBOARD,
];
