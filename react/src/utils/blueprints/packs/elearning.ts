/**
 * E-learning pack — course catalog, course start, quiz attempt, progress
 * tracking.
 *
 * Maturity: STABLE. LMS vocabulary is consistent across the major players
 * (Coursera, Udemy, Moodle, OpenClassrooms, Khan Academy).
 */

import { JourneyBlueprint } from '../../../types';

const ELEARNING_LEARNER_JOURNEY: JourneyBlueprint = {
  id: 'elearning.learner-journey',
  name: 'Parcours apprenant - du catalogue a la progression',
  description:
    "Guide un nouvel apprenant: parcourir le catalogue, demarrer un cours, repondre a un quiz et suivre sa progression.",
  vertical: 'elearning',
  intent: 'primary-action',
  minResolvedSteps: 2,
  priority: 10,
  steps: [
    {
      semanticRole: 'elearning.course-catalog',
      title: 'Parcourez le catalogue de cours',
      description:
        "Le catalogue regroupe l'ensemble des cours disponibles. Filtrez par theme, niveau ou langue pour trouver le bon point de depart.",
      position: 'BOTTOM',
      action: 'CLICK',
      required: true,
      targetHints: {
        routePatterns: [
          '/courses', '/catalog', '/programs', '/learn', '/library',
          '/cours', '/catalogue', '/programmes', '/apprendre',
          '/cursos', '/catalogo', '/programas', '/aprender',
          '/kurse', '/katalog', '/lernen',
          '/corsi', '/catalogo', '/imparare',
          '/cursos', '/catalogo', '/aprender',
        ],
        selectorHints: [
          '[data-tour-id="course-catalog"]',
          '[data-tour-id="course-list"]',
          '[data-tour-id*="catalog"]',
          '[data-tour-id*="course"]',
          'a[href*="/courses"]',
          'a[href*="/cours"]',
          'a[href*="/cursos"]',
          'a[href*="/kurse"]',
          'a[href*="/corsi"]',
          'article[class*="course-card"]',
          'article[class*="CourseCard"]',
          'a[class*="course-tile"]',
          'a[class*="CourseTile"]',
          'a[aria-label*="course" i]',
          'a[aria-label*="cours" i]',
        ],
        semanticTokens: [
          'course', 'courses', 'catalog', 'program', 'lesson',
          'cours', 'catalogue', 'programme', 'lecon',
          'curso', 'catalogo', 'programa', 'leccion',
          'kurs', 'katalog', 'programm', 'lektion',
          'corso', 'catalogo', 'programma', 'lezione',
          'curso', 'catalogo', 'programa', 'licao',
        ],
        actionVerbs: [
          'browse courses', 'view catalog', 'find course',
          'parcourir les cours', 'voir le catalogue',
          'ver cursos', 'explorar catalogo',
          'kurse durchsuchen',
          'esplora corsi',
          'ver cursos',
        ],
        elementTags: ['a', 'button'],
      },
    },
    {
      semanticRole: 'elearning.start-course',
      title: 'Demarrez un cours',
      description:
        "Une fois la fiche du cours ouverte, cliquez sur 'Commencer' pour lancer le premier module. Vous pouvez reprendre a tout moment.",
      position: 'BOTTOM',
      action: 'CLICK',
      inferAfter: ['elearning.course-catalog'],
      targetHints: {
        selectorHints: [
          '[data-tour-id="start-course"]',
          '[data-tour-id="enroll-course"]',
          '[data-tour-id="resume-course"]',
          '[data-tour-id*="start-course"]',
          '[data-tour-id*="enroll"]',
          'button[class*="enroll-button"]',
          'button[class*="EnrollButton"]',
          'button[class*="StartCourse"]',
          'button[class*="ResumeCourse"]',
          'button[aria-label*="enroll" i]',
          'button[aria-label*="start course" i]',
          'button[aria-label*="resume" i]',
          'button[aria-label*="commencer" i]',
          'button[aria-label*="reprendre" i]',
        ],
        semanticTokens: [
          'start', 'enroll', 'resume', 'continue',
          'commencer', 'demarrer', 'reprendre', 'continuer',
          'comenzar', 'inscribirse', 'continuar',
          'starten', 'einschreiben', 'fortsetzen',
          'inizia', 'iscriviti', 'continua',
          'comecar', 'inscrever-se', 'continuar',
        ],
        actionVerbs: [
          'start course', 'enroll now', 'resume course', 'continue learning',
          'commencer le cours', 'reprendre le cours',
          'comenzar curso', 'inscribirse',
          'kurs starten', 'einschreiben',
          'inizia corso',
          'comecar curso',
        ],
        elementTags: ['button', 'a'],
      },
    },
    {
      semanticRole: 'elearning.quiz-attempt',
      title: 'Tentez le quiz de validation',
      description:
        "A la fin du module, le quiz valide vos acquis. Vous pouvez le repasser autant que necessaire pour atteindre le score minimum.",
      position: 'TOP',
      action: 'CLICK',
      targetHints: {
        selectorHints: [
          '[data-tour-id="quiz"]',
          '[data-tour-id="quiz-start"]',
          '[data-tour-id="take-quiz"]',
          '[data-tour-id*="quiz"]',
          '[data-tour-id*="exam"]',
          '[data-tour-id*="assessment"]',
          'button[class*="quiz-start"]',
          'button[class*="QuizStart"]',
          'button[class*="StartQuiz"]',
          'section[class*="quiz"]',
          'section[class*="Quiz"]',
          'div[class*="quiz-container"]',
          'button[aria-label*="quiz" i]',
          'button[aria-label*="take quiz" i]',
        ],
        semanticTokens: [
          'quiz', 'exam', 'assessment', 'test', 'evaluation',
          'quiz', 'examen', 'evaluation', 'test',
          'cuestionario', 'examen', 'evaluacion',
          'quiz', 'prufung', 'bewertung',
          'quiz', 'esame', 'valutazione',
          'quiz', 'exame', 'avaliacao',
        ],
        actionVerbs: [
          'take quiz', 'start quiz', 'take exam',
          'passer le quiz', 'demarrer le quiz',
          'realizar cuestionario',
          'quiz starten',
          'inizia quiz',
          'fazer quiz',
        ],
        elementTags: ['button', 'a'],
      },
    },
    {
      semanticRole: 'elearning.progress-tracking',
      title: 'Suivez votre progression',
      description:
        "La page progression affiche les modules termines, le temps passe et les badges obtenus. Un bon indicateur de votre rythme.",
      position: 'RIGHT',
      action: 'NEXT',
      targetHints: {
        routePatterns: [
          '/progress', '/dashboard', '/learning-path', '/my-courses',
          '/progression', '/mes-cours', '/parcours',
          '/progreso', '/mis-cursos',
          '/fortschritt', '/meine-kurse',
          '/progresso', '/i-miei-corsi',
          '/progresso', '/meus-cursos',
        ],
        selectorHints: [
          '[data-tour-id="my-progress"]',
          '[data-tour-id="learning-progress"]',
          '[data-tour-id*="progress"]',
          '[data-tour-id*="my-courses"]',
          'a[href*="/progress"]',
          'a[href*="/my-courses"]',
          'a[href*="/progression"]',
          'a[href*="/mes-cours"]',
          'div[class*="progress-bar"]',
          'div[class*="ProgressBar"]',
          'section[class*="progress-tracking"]',
        ],
        semanticTokens: [
          'progress', 'my courses', 'learning path', 'completion',
          'progression', 'mes cours', 'parcours',
          'progreso', 'mis cursos',
          'fortschritt', 'meine kurse',
          'progresso', 'i miei corsi',
          'progresso', 'meus cursos',
        ],
        elementTags: ['a', 'button'],
      },
    },
  ],
};

export const elearningBlueprints: JourneyBlueprint[] = [ELEARNING_LEARNER_JOURNEY];
