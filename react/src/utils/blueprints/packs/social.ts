/**
 * Social / Community pack — user profile, content feed, notifications,
 * post creation.
 *
 * Maturity: STABLE. Social vocabulary is well standardized thanks to large
 * platforms (Facebook, LinkedIn, Discord, Reddit), with predictable copy
 * patterns ("Post", "Like", "Comment", "Follow").
 */

import { JourneyBlueprint } from '../../../types';

const SOCIAL_COMMUNITY_DISCOVERY: JourneyBlueprint = {
  id: 'social.community-discovery',
  name: 'Decouverte de la communaute',
  description:
    "Aide le nouvel arrivant a prendre ses marques: completer son profil, parcourir le feed, gerer ses notifications et publier son premier post.",
  vertical: 'social',
  intent: 'discovery',
  minResolvedSteps: 2,
  priority: 10,
  steps: [
    {
      semanticRole: 'social.user-profile',
      title: 'Personnalisez votre profil',
      description:
        "Ajoutez votre photo, votre bio et vos centres d'interet. Un profil complet vous rend visible et credible aupres de la communaute.",
      position: 'BOTTOM',
      action: 'CLICK',
      targetHints: {
        routePatterns: [
          '/profile', '/me', '/account', '/u/', '/user/',
          '/profil', '/mon-profil', '/moi',
          '/perfil', '/mi-perfil',
          '/profil', '/mein-profil',
          '/profilo', '/mio-profilo',
          '/perfil', '/meu-perfil',
        ],
        selectorHints: [
          '[data-tour-id="my-profile"]',
          '[data-tour-id="user-profile"]',
          '[data-tour-id*="profile"]',
          'a[href*="/profile"]',
          'a[href*="/profil"]',
          'a[href*="/perfil"]',
          'a[href*="/me"]',
          'a[href^="/u/"]',
          'a[href^="/user/"]',
          'div[class*="user-avatar"]',
          'div[class*="UserAvatar"]',
          'div[class*="ProfileAvatar"]',
          'button[aria-label*="profile" i]',
          'button[aria-label*="my account" i]',
        ],
        semanticTokens: [
          'profile', 'my profile', 'bio',
          'profil', 'mon profil', 'biographie',
          'perfil', 'mi perfil', 'biografia',
          'profil', 'mein profil',
          'profilo', 'mio profilo',
          'perfil', 'meu perfil',
        ],
        actionVerbs: [
          'edit profile', 'complete profile', 'view profile',
          'modifier profil', 'completer profil',
          'editar perfil', 'completar perfil',
          'profil bearbeiten',
          'modifica profilo',
          'editar perfil',
        ],
        elementTags: ['a', 'button'],
      },
    },
    {
      semanticRole: 'social.feed-scroll',
      title: 'Parcourez le feed',
      description:
        "Le feed regroupe les publications recentes des comptes et communautes que vous suivez. Faites defiler pour vous immerger.",
      position: 'TOP',
      action: 'NEXT',
      required: true,
      targetHints: {
        routePatterns: [
          '/feed', '/home', '/timeline', '/explore', '/discover',
          '/accueil', '/decouvrir',
          '/inicio', '/explorar', '/descubrir',
          '/startseite', '/entdecken',
          '/home', '/esplora', '/scopri',
          '/inicio', '/explorar', '/descobrir',
        ],
        selectorHints: [
          '[data-tour-id="feed"]',
          '[data-tour-id="timeline"]',
          '[data-tour-id="home-feed"]',
          '[data-tour-id*="feed"]',
          'main[class*="feed"]',
          'main[class*="Feed"]',
          'section[class*="timeline"]',
          'section[class*="Timeline"]',
          'div[class*="post-list"]',
          'div[class*="PostList"]',
          'div[class*="feed-container"]',
          'div[role="feed"]',
          'main[aria-label*="feed" i]',
          'main[aria-label*="timeline" i]',
        ],
        semanticTokens: [
          'feed', 'timeline', 'home', 'explore', 'discover',
          'fil', 'accueil', 'decouvrir',
          'feed', 'inicio', 'explorar',
          'feed', 'startseite', 'entdecken',
          'feed', 'home', 'esplora',
          'feed', 'inicio', 'descobrir',
        ],
        elementTags: ['a', 'button'],
      },
    },
    {
      semanticRole: 'social.notifications',
      title: 'Verifiez vos notifications',
      description:
        "L'icone notifications regroupe les mentions, les nouvelles connexions et les reponses a vos contributions.",
      position: 'BOTTOM',
      action: 'CLICK',
      targetHints: {
        routePatterns: [
          '/notifications', '/alerts',
          '/notifications', '/alertes',
          '/notificaciones', '/alertas',
          '/benachrichtigungen',
          '/notifiche',
          '/notificacoes',
        ],
        selectorHints: [
          '[data-tour-id="notifications"]',
          '[data-tour-id="notifications-bell"]',
          '[data-tour-id*="notification"]',
          'button[class*="notifications-bell"]',
          'button[class*="NotificationBell"]',
          'a[href*="/notifications"]',
          'a[href*="/alertes"]',
          'a[href*="/notificaciones"]',
          'button[aria-label*="notifications" i]',
          'button[aria-label*="alerts" i]',
        ],
        semanticTokens: [
          'notifications', 'alerts', 'inbox', 'mentions',
          'notifications', 'alertes', 'mentions',
          'notificaciones', 'alertas',
          'benachrichtigungen',
          'notifiche',
          'notificacoes',
        ],
        actionVerbs: [
          'see notifications', 'open alerts', 'check inbox',
          'voir notifications', 'ouvrir alertes',
          'ver notificaciones',
          'benachrichtigungen anzeigen',
          'visualizza notifiche',
          'ver notificacoes',
        ],
        elementTags: ['a', 'button'],
      },
    },
    {
      semanticRole: 'social.create-post',
      title: 'Publiez votre premier post',
      description:
        "Cliquez pour rediger une publication. Texte court, photo, lien ou question: la communaute vous repondra plus vite si vous demarrez les echanges.",
      position: 'RIGHT',
      action: 'CLICK',
      targetHints: {
        selectorHints: [
          '[data-tour-id="create-post"]',
          '[data-tour-id="new-post"]',
          '[data-tour-id="compose"]',
          '[data-tour-id*="new-post"]',
          '[data-tour-id*="create-post"]',
          '[data-tour-id*="compose"]',
          'button[class*="new-post"]',
          'button[class*="NewPost"]',
          'button[class*="CreatePost"]',
          'button[class*="ComposeButton"]',
          'button[class*="floating-action-button"]',
          'a[href*="/compose"]',
          'a[href*="/new-post"]',
          'button[aria-label*="new post" i]',
          'button[aria-label*="create post" i]',
          'button[aria-label*="compose" i]',
          'button[aria-label*="nouveau post" i]',
          'button[aria-label*="publier" i]',
        ],
        semanticTokens: [
          'post', 'create post', 'new post', 'compose', 'publish',
          'publier', 'nouveau post', 'rediger',
          'publicar', 'nuevo post',
          'beitrag', 'neuer beitrag', 'veroffentlichen',
          'post', 'nuovo post', 'pubblica',
          'publicar', 'novo post',
        ],
        actionVerbs: [
          'new post', 'create post', 'compose', 'share', 'publish',
          'publier', 'nouveau post', 'partager',
          'publicar', 'nuevo post',
          'beitrag erstellen', 'veroffentlichen',
          'pubblica', 'nuovo post',
          'publicar', 'novo post',
        ],
        elementTags: ['button', 'a'],
      },
    },
  ],
};

export const socialBlueprints: JourneyBlueprint[] = [SOCIAL_COMMUNITY_DISCOVERY];
