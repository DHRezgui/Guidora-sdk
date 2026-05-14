/**
 * Journey blueprints — curated catalog of business-meaningful, possibly
 * multi-page tour templates.
 *
 * Each blueprint declares an ordered sequence of `JourneyStepBlueprint`s
 * that the resolver tries to map onto the host application's real DOM. When
 * enough steps resolve, a `SuggestedTourDraft` is emitted whose semantics are
 * tied to a known business funnel (e-commerce purchase, SaaS first-resource,
 * lead capture, etc.) rather than to a generic page heading.
 *
 * Extending the catalog:
 * 1. Add a new `JourneyBlueprint` literal below.
 * 2. Provide multilingual `semanticTokens` / `actionVerbs` (FR + EN minimum)
 *    so the resolver matches both localized hosts.
 * 3. Use `routePatterns` for steps that typically live on dedicated routes
 *    (e.g. `/shop`, `/cart`) — this is what enables cross-page draft
 *    assembly via internal `<a href>` detection.
 * 4. Mark only the truly indispensable steps as `required` — over-marking
 *    causes blueprints to be rejected on hosts that don't fit the template
 *    exactly.
 */

import { JourneyBlueprint, JourneyVertical } from '../types';

// ============================================================================
// E-commerce blueprints
// ============================================================================

const ECOMMERCE_PURCHASE_JOURNEY: JourneyBlueprint = {
  id: 'ecommerce.purchase-journey',
  name: "Parcours d'achat - decouverte et passage en caisse",
  description:
    "Guide complet du visiteur depuis la decouverte du catalogue jusqu'au paiement: explorer la boutique, choisir un produit, l'ajouter au panier puis finaliser la commande.",
  vertical: 'ecommerce',
  intent: 'primary-action',
  // Required `browse-catalog` is the only mandatory entry point: as long as
  // there is *some* link to the catalog we can build a meaningful funnel.
  // All other steps (view-product, add-to-cart, view-cart, checkout) are
  // contextually deep and resolve cross-page when possible. The blueprint
  // remains viable with just 2 resolved steps, e.g. browse-catalog + view-cart.
  minResolvedSteps: 2,
  priority: 10,
  steps: [
    {
      semanticRole: 'ecommerce.browse-catalog',
      title: 'Decouvrez notre catalogue',
      description:
        'Parcourez la boutique pour explorer les produits disponibles. Cliquez pour acceder a la liste complete.',
      position: 'BOTTOM',
      action: 'CLICK',
      required: true,
      targetHints: {
        routePatterns: [
          // EN
          '/shop', '/products', '/catalog', '/store', '/collections', '/all-products',
          // FR
          '/boutique', '/produits', '/catalogue',
          // ES
          '/tienda', '/productos',
          // DE
          '/laden', '/produkte',
          // IT
          '/negozio', '/prodotti',
          // PT
          '/loja', '/produtos',
        ],
        selectorHints: [
          // Explicit tour ids (preferred)
          '[data-tour-id="nav-shop"]',
          '[data-tour-id="shop-link"]',
          '[data-tour-id="catalog-link"]',
          '[data-tour-id*="shop"]',
          '[data-tour-id*="catalog"]',
          '[data-tour-id*="store"]',
          // Class / aria conventions
          'a[class*="shop-link"]',
          'a[class*="ShopLink"]',
          'a[class*="nav-shop"]',
          'a[aria-label*="shop" i]',
          'a[aria-label*="catalog" i]',
          'a[aria-label*="boutique" i]',
        ],
        semanticTokens: [
          // EN
          'shop', 'store', 'catalog', 'products', 'collection', 'collections',
          // FR
          'boutique', 'catalogue', 'produits',
          // ES
          'tienda', 'productos',
          // DE
          'laden', 'produkte',
          // IT
          'negozio', 'prodotti',
          // PT
          'loja', 'produtos',
        ],
        actionVerbs: [
          'shop', 'browse', 'explore', 'discover',
          'parcourir', 'decouvrir', 'explorer',
          'descubrir', 'explorar',
          'entdecken', 'durchsuchen',
          'esplorare', 'scoprire',
          'descobrir', 'explorar',
        ],
        elementTags: ['a', 'button'],
      },
    },
    {
      semanticRole: 'ecommerce.view-product',
      title: 'Choisissez un produit',
      description:
        "Selectionnez l'article qui vous interesse pour consulter sa fiche detaillee.",
      position: 'BOTTOM',
      action: 'CLICK',
      targetHints: {
        routePatterns: [
          '/product/', '/produit/', '/p/', '/item/',
          '/articulo/', '/artikel/', '/produkt/', '/articolo/', '/artigo/',
        ],
        selectorHints: [
          // Explicit tour ids
          '[data-tour-id^="product-"]',
          '[data-tour-id="product-card"]',
          '[data-tour-id*="product"]',
          '[data-tour-id*="featured"]',
          // Standard data attributes
          'article[data-product]',
          'article[data-product-id]',
          '[data-product-id]',
          // Class conventions (BEM, Tailwind, PascalCase)
          'article[class*="product"]',
          '[class*="product-card"]',
          '[class*="ProductCard"]',
          '[class*="productCard"]',
          '[class*="product-tile"]',
          '[class*="ProductTile"]',
          '[class*="product-item"]',
          // Href conventions
          'a[href*="/product/"]',
          'a[href*="/produit/"]',
          'a[href*="/p/"]',
          'a[href*="/item/"]',
          // Aria
          'a[aria-label*="view product" i]',
          'a[aria-label*="quick view" i]',
        ],
        semanticTokens: [
          // EN
          'product', 'item', 'detail', 'details', 'preview', 'quick view',
          // FR
          'produit', 'article', 'fiche', 'apercu',
          // ES
          'producto', 'articulo', 'detalle',
          // DE
          'produkt', 'artikel', 'detail',
          // IT
          'prodotto', 'articolo', 'dettaglio',
          // PT
          'produto', 'artigo', 'detalhe',
        ],
        actionVerbs: [
          'view', 'see', 'open', 'details', 'preview',
          'voir', 'consulter', 'apercevoir',
          'ver', 'consultar',
          'ansehen', 'anschauen',
          'vedere', 'visualizzare',
        ],
        elementTags: ['a', 'button'],
      },
    },
    {
      semanticRole: 'ecommerce.add-to-cart',
      title: 'Ajoutez un article a votre panier',
      description:
        "Sur la fiche produit, le bouton 'Ajouter au panier' prepare votre commande.",
      position: 'BOTTOM',
      action: 'CLICK',
      // Not `required`: the add-to-cart button typically lives on /product/X,
      // not on the home or catalog. Marking it required would systematically
      // reject the whole blueprint on most landing pages. The shopper can
      // still discover it once they land on a product page.
      targetHints: {
        selectorHints: [
          // Explicit tour ids
          '[data-tour-id="add-to-cart"]',
          '[data-tour-id^="add-to-cart-"]',
          '[data-tour-id*="add-to-cart"]',
          '[data-tour-id*="addtocart"]',
          '[data-tour-id*="add_to_cart"]',
          '[data-tour-id*="add-to-bag"]',
          '[data-tour-id*="buy-now"]',
          '[data-tour-id*="buy_now"]',
          // Class conventions
          'button[class*="add-to-cart"]',
          'button[class*="AddToCart"]',
          'button[class*="addToCart"]',
          'button[class*="add_to_cart"]',
          'button[class*="atc-button"]',
          'button[class*="btn-add-to-cart"]',
          'button[class*="add-to-bag"]',
          'button[class*="buy-now"]',
          // Aria (multi-lang)
          'button[aria-label*="add to cart" i]',
          'button[aria-label*="add to bag" i]',
          'button[aria-label*="add to basket" i]',
          'button[aria-label*="buy now" i]',
          'button[aria-label*="ajouter" i]',
          'button[aria-label*="anadir" i]',
          'button[aria-label*="hinzufugen" i]',
          'button[aria-label*="aggiungi" i]',
          'button[aria-label*="adicionar" i]',
        ],
        semanticTokens: [
          'cart', 'bag', 'basket',
          'panier',
          'carrito', 'cesta',
          'warenkorb', 'einkaufswagen',
          'carrello',
          'carrinho', 'cesto',
        ],
        actionVerbs: [
          // EN
          'add to cart', 'add to basket', 'add to bag', 'buy now', 'add to wishlist',
          // FR
          'ajouter au panier', "ajouter a la commande", 'acheter maintenant',
          // ES
          'anadir al carrito', 'anadir a la cesta', 'comprar ahora',
          // DE
          'in den warenkorb', 'in den einkaufswagen', 'jetzt kaufen',
          // IT
          'aggiungi al carrello', 'compra ora',
          // PT
          'adicionar ao carrinho', 'comprar agora',
        ],
        elementTags: ['button'],
      },
    },
    {
      semanticRole: 'ecommerce.view-cart',
      title: 'Verifiez votre panier',
      description:
        'Consultez les articles selectionnes avant de passer commande. Vous pouvez encore ajuster les quantites.',
      position: 'BOTTOM',
      action: 'CLICK',
      targetHints: {
        routePatterns: [
          '/cart', '/basket', '/bag',
          '/panier',
          '/carrito', '/cesta',
          '/warenkorb', '/einkaufswagen',
          '/carrello',
          '/carrinho',
        ],
        selectorHints: [
          // Explicit tour ids
          '[data-tour-id="cart-link"]',
          '[data-tour-id="view-cart"]',
          '[data-tour-id*="cart"]',
          '[data-tour-id*="basket"]',
          '[data-tour-id*="panier"]',
          // Class conventions
          'a[class*="cart-icon"]',
          'a[class*="CartIcon"]',
          'a[class*="cart-link"]',
          'a[class*="basket-link"]',
          'a[class*="mini-cart"]',
          // Href
          'a[href="/cart"]', 'a[href="/panier"]', 'a[href="/basket"]',
          'a[href="/carrito"]', 'a[href="/warenkorb"]', 'a[href="/carrello"]', 'a[href="/carrinho"]',
          // Aria
          'a[aria-label*="cart" i]',
          'a[aria-label*="basket" i]',
          'a[aria-label*="panier" i]',
        ],
        semanticTokens: [
          'cart', 'basket', 'bag',
          'panier',
          'carrito', 'cesta',
          'warenkorb', 'einkaufswagen',
          'carrello',
          'carrinho',
        ],
        actionVerbs: [
          'view cart', 'open cart', 'go to cart', 'see cart',
          'voir le panier', 'mon panier', 'ouvrir le panier',
          'ver carrito', 'mi carrito',
          'warenkorb anzeigen', 'mein warenkorb',
          'vedi carrello', 'il mio carrello',
          'ver carrinho', 'meu carrinho',
        ],
        elementTags: ['a', 'button'],
      },
    },
    {
      semanticRole: 'ecommerce.checkout',
      title: 'Finalisez votre commande',
      description:
        'Passez en caisse pour saisir vos informations de livraison et de paiement.',
      position: 'TOP',
      action: 'CLICK',
      // Not `required`: checkout is usually reached via the cart, not directly
      // from the home page. The blueprint still produces a great draft when
      // browse + view-cart are resolved cross-page.
      // Deductive resolution: when `view-cart` was resolved, we can infer the
      // existence of a checkout flow even if no direct `/checkout` link lives
      // in the current page DOM. See `journey-resolver.ts:resolveStepDeductive`.
      inferAfter: ['ecommerce.view-cart'],
      targetHints: {
        routePatterns: [
          '/checkout', '/checkout-page',
          '/commande', '/paiement', '/passage-caisse',
          '/pago', '/finalizar-compra', '/caja',
          '/kasse', '/zur-kasse', '/bezahlen',
          '/pagamento', '/cassa',
          '/finalizar-compra',
        ],
        selectorHints: [
          // Explicit tour ids
          '[data-tour-id="checkout"]',
          '[data-tour-id="checkout-button"]',
          '[data-tour-id*="checkout"]',
          '[data-tour-id*="proceed-to-checkout"]',
          '[data-tour-id*="place-order"]',
          // Class conventions
          'button[class*="checkout"]',
          'button[class*="Checkout"]',
          'button[class*="proceed-to-checkout"]',
          'button[class*="place-order"]',
          'a[class*="checkout-link"]',
          // Href
          'a[href*="/checkout"]',
          'a[href*="/commande"]',
          'a[href*="/pago"]',
          'a[href*="/kasse"]',
          'a[href*="/pagamento"]',
          // Aria
          'button[aria-label*="checkout" i]',
          'button[aria-label*="proceed" i]',
          'button[aria-label*="place order" i]',
          'button[aria-label*="commander" i]',
          'button[aria-label*="comprar" i]',
        ],
        semanticTokens: [
          'checkout', 'order', 'payment',
          'commande', 'paiement', 'caisse',
          'pago', 'finalizar', 'caja',
          'kasse', 'zahlung', 'bestellung',
          'pagamento', 'cassa', 'ordine',
          'pagamento', 'finalizar',
        ],
        actionVerbs: [
          'checkout', 'proceed to checkout', 'place order', 'pay now',
          'passer commande', 'commander', 'finaliser', 'payer',
          'pagar', 'comprar', 'finalizar compra',
          'zur kasse', 'jetzt bezahlen', 'bestellen',
          'paga ora', 'completa ordine',
        ],
        elementTags: ['a', 'button'],
      },
    },
  ],
};

const ECOMMERCE_ACCOUNT_ONBOARDING: JourneyBlueprint = {
  id: 'ecommerce.account-onboarding',
  name: 'Creation de compte et premier acces',
  description:
    "Onboarding d'un nouveau client: creation du compte, premiere connexion puis decouverte du profil personnel.",
  vertical: 'ecommerce',
  intent: 'discovery',
  minResolvedSteps: 2,
  priority: 5,
  steps: [
    {
      semanticRole: 'auth.register',
      title: 'Creez votre compte',
      description:
        "Inscrivez-vous pour profiter d'un suivi de commandes et d'offres personnalisees.",
      position: 'BOTTOM',
      action: 'CLICK',
      // Not `required`: auth links often live inside a closed user dropdown
      // (display:none) and may be discoverable only via the route. The
      // resolver still accepts hidden anchors so the cross-page route
      // resolution works fine; we just don't reject the blueprint if it
      // can't be located.
      targetHints: {
        routePatterns: [
          '/register', '/signup', '/sign-up', '/create-account',
          '/inscription', '/creer-compte', '/s-inscrire',
          '/registro', '/registrarse',
          '/registrieren', '/anmelden',
          '/registrati', '/iscriviti',
          '/registar', '/cadastrar',
        ],
        selectorHints: [
          '[data-tour-id="register-link"]',
          '[data-tour-id="signup-button"]',
          '[data-tour-id*="register"]',
          '[data-tour-id*="signup"]',
          '[data-tour-id*="sign-up"]',
          'a[href*="/register"]',
          'a[href*="/signup"]',
          'a[href*="/inscription"]',
          'a[href*="/registro"]',
          'a[class*="register-link"]',
          'a[class*="signup-link"]',
          'a[aria-label*="register" i]',
          'a[aria-label*="sign up" i]',
          'a[aria-label*="inscription" i]',
        ],
        semanticTokens: [
          'register', 'signup', 'sign up', 'create account',
          'inscription', 'creer compte',
          'registro', 'registrarse',
          'registrieren', 'konto erstellen',
          'registrati', 'crea account',
          'registar', 'criar conta',
        ],
        actionVerbs: [
          'register', 'sign up', 'create account',
          's inscrire', "s'inscrire", 'creer un compte',
          'registrarse', 'crear cuenta',
          'registrieren', 'konto erstellen',
          'registrati', 'crea un account',
          'registar', 'criar conta',
        ],
        elementTags: ['a', 'button'],
      },
    },
    {
      semanticRole: 'auth.login',
      title: 'Connectez-vous',
      description:
        'Une fois votre compte cree, identifiez-vous pour retrouver vos commandes et favoris.',
      position: 'BOTTOM',
      action: 'CLICK',
      targetHints: {
        routePatterns: [
          '/login', '/signin', '/sign-in',
          '/connexion', '/se-connecter',
          '/iniciar-sesion', '/acceso',
          '/anmelden', '/einloggen',
          '/accedi', '/login',
          '/entrar',
        ],
        selectorHints: [
          '[data-tour-id="login-link"]',
          '[data-tour-id="signin-button"]',
          '[data-tour-id*="login"]',
          '[data-tour-id*="signin"]',
          '[data-tour-id*="sign-in"]',
          'a[href*="/login"]',
          'a[href*="/connexion"]',
          'a[href*="/signin"]',
          'a[href*="/iniciar-sesion"]',
          'a[class*="login-link"]',
          'a[aria-label*="sign in" i]',
          'a[aria-label*="log in" i]',
          'a[aria-label*="connexion" i]',
        ],
        semanticTokens: [
          'login', 'signin', 'sign in',
          'connexion', 'se connecter',
          'iniciar sesion', 'acceso',
          'anmelden', 'einloggen',
          'accedi',
          'entrar',
        ],
        actionVerbs: [
          'log in', 'sign in',
          'se connecter', 'connexion',
          'iniciar sesion',
          'anmelden', 'einloggen',
          'accedere',
          'entrar',
        ],
        elementTags: ['a', 'button'],
      },
    },
    {
      semanticRole: 'auth.view-profile',
      title: 'Accedez a votre espace personnel',
      description:
        "Consultez votre profil pour gerer vos adresses, suivre vos commandes et adapter vos preferences.",
      position: 'BOTTOM',
      action: 'CLICK',
      // NOTE: `inferAfter` is deliberately NOT declared here. Unlike
      // /checkout (quasi-universal in e-commerce, always reachable from a
      // resolved /cart), the profile/account route is highly app-specific:
      // small landing pages, marketing sites and some MVPs simply don't
      // expose any `/profile` or `/account` route. Deducing this step on
      // such apps would generate a tour that navigates to a 404. We prefer
      // to leave the step `unresolved` (and let the blueprint produce a
      // 2/3 draft) over emitting a broken navigation.
      targetHints: {
        routePatterns: [
          '/profile', '/account', '/dashboard',
          '/mon-compte', '/profil', '/mon-espace',
          '/cuenta', '/perfil', '/mi-cuenta',
          '/konto', '/mein-konto', '/profil',
          '/account', '/profilo', '/il-mio-account',
          '/conta', '/perfil', '/minha-conta',
        ],
        selectorHints: [
          '[data-tour-id="profile-link"]',
          '[data-tour-id="account-link"]',
          '[data-tour-id*="profile"]',
          '[data-tour-id*="account"]',
          'a[href*="/account"]',
          'a[href*="/profile"]',
          'a[href*="/mon-compte"]',
          'a[href*="/mi-cuenta"]',
          'a[href*="/mein-konto"]',
          'a[class*="account-link"]',
          'a[class*="profile-link"]',
          'a[aria-label*="account" i]',
          'a[aria-label*="profile" i]',
        ],
        semanticTokens: [
          'account', 'profile',
          'compte', 'profil', 'mon espace',
          'cuenta', 'perfil',
          'konto', 'profil',
          'account', 'profilo',
          'conta', 'perfil',
        ],
        actionVerbs: [
          'my account', 'profile',
          'mon compte', 'mon profil',
          'mi cuenta', 'mi perfil',
          'mein konto', 'mein profil',
          'il mio account', 'mio profilo',
          'minha conta', 'meu perfil',
        ],
        elementTags: ['a', 'button'],
      },
    },
  ],
};

// ============================================================================
// SaaS blueprints
// ============================================================================

const SAAS_FIRST_RESOURCE: JourneyBlueprint = {
  id: 'saas.first-resource-creation',
  name: 'Creation de la premiere ressource',
  description:
    "Onboarding metier pour un nouvel utilisateur: comprendre le tableau de bord, lancer la creation d'une ressource cle puis la sauvegarder.",
  vertical: 'saas',
  intent: 'primary-action',
  minResolvedSteps: 2,
  priority: 10,
  steps: [
    {
      semanticRole: 'saas.dashboard-overview',
      title: 'Bienvenue sur votre tableau de bord',
      description:
        "Cette vue regroupe les indicateurs cles. Prenez quelques secondes pour la decouvrir avant la premiere action.",
      position: 'BOTTOM',
      action: 'NEXT',
      targetHints: {
        routePatterns: ['/dashboard', '/home', '/app', '/console', '/tableau-de-bord'],
        selectorHints: [
          '[data-tour-id="dashboard-overview"]',
          '[data-tour-id="dashboard-title"]',
          'h1',
        ],
        semanticTokens: ['dashboard', 'tableau de bord', 'overview', 'apercu', 'console', 'home'],
        elementTags: ['a', 'button', 'form'],
      },
    },
    {
      semanticRole: 'saas.create-resource',
      title: 'Creez votre premiere ressource',
      description:
        'Lancez la creation. Le SDK a identifie le bouton principal qui declenche le formulaire.',
      position: 'BOTTOM',
      action: 'CLICK',
      required: true,
      targetHints: {
        selectorHints: [
          '[data-tour-id="create-resource"]',
          '[data-tour-id^="create-"]',
          '[data-tour-id^="new-"]',
          '[data-tour-id^="add-"]',
          '[data-tour-id*="create"]',
          '[data-tour-id*="primary-action"]',
          'button[class*="create-button"]',
          'button[class*="CreateButton"]',
          'button[class*="primary-action"]',
          'button[class*="btn-primary"]',
          'button[aria-label*="create" i]',
          'button[aria-label*="new" i]',
          'button[aria-label*="add" i]',
          'button[aria-label*="creer" i]',
          'button[aria-label*="nouveau" i]',
          'button[aria-label*="crear" i]',
          'button[aria-label*="erstellen" i]',
          'button[aria-label*="creare" i]',
        ],
        semanticTokens: [
          'create', 'new', 'add',
          'creer', 'nouveau', 'nouvelle', 'ajouter',
          'crear', 'nuevo', 'agregar',
          'erstellen', 'neu', 'hinzufugen',
          'creare', 'nuovo', 'aggiungere',
          'criar', 'novo', 'adicionar',
        ],
        actionVerbs: [
          'create', 'new', 'add', '+ new', '+ create',
          'creer', 'nouveau', 'ajouter', '+ nouveau',
          'crear', 'agregar', '+ nuevo',
          'erstellen', 'hinzufugen', '+ neu',
          'creare', 'aggiungere', '+ nuovo',
          'criar', 'adicionar', '+ novo',
        ],
        elementTags: ['button', 'a'],
      },
    },
    {
      semanticRole: 'saas.open-settings',
      title: 'Ajustez vos parametres',
      description:
        'Configurez votre espace (preferences, integrations, securite) une fois la premiere ressource creee.',
      position: 'RIGHT',
      action: 'CLICK',
      targetHints: {
        routePatterns: ['/settings', '/parametres', '/preferences', '/config'],
        selectorHints: [
          '[data-tour-id="settings-link"]',
          'a[href*="/settings"]',
          'a[href*="/parametres"]',
          'button[aria-label*="settings" i]',
        ],
        semanticTokens: ['settings', 'parametres', 'preferences', 'configuration'],
        actionVerbs: ['settings', 'parametres', 'preferences', 'configurer'],
        elementTags: ['a', 'button'],
      },
    },
  ],
};

const SAAS_TEAM_INVITE: JourneyBlueprint = {
  id: 'saas.invite-teammate',
  name: 'Inviter un collaborateur',
  description:
    "Aider l'utilisateur a passer en mode equipe: ouvrir la zone team/membres puis lancer l'invitation.",
  vertical: 'saas',
  intent: 'support-navigation',
  minResolvedSteps: 2,
  priority: 5,
  steps: [
    {
      semanticRole: 'saas.open-settings',
      title: 'Ouvrez la gestion de votre equipe',
      description:
        'Rendez-vous dans la section equipe ou membres pour gerer les acces.',
      position: 'RIGHT',
      action: 'CLICK',
      required: true,
      targetHints: {
        routePatterns: ['/team', '/members', '/users', '/equipe', '/membres', '/utilisateurs', '/settings/team'],
        selectorHints: [
          '[data-tour-id="team-link"]',
          '[data-tour-id="members-link"]',
          'a[href*="/team"]',
          'a[href*="/members"]',
          'a[href*="/equipe"]',
        ],
        semanticTokens: ['team', 'members', 'users', 'equipe', 'membres', 'utilisateurs', 'collaborators'],
        elementTags: ['a', 'button'],
      },
    },
    {
      semanticRole: 'saas.invite-teammate',
      title: 'Invitez un collaborateur',
      description:
        "Lancez l'invitation. Le SDK a repere le bouton qui ouvre le formulaire d'envoi.",
      position: 'BOTTOM',
      action: 'CLICK',
      required: true,
      targetHints: {
        selectorHints: [
          '[data-tour-id="invite-member"]',
          '[data-tour-id="invite-button"]',
          'button[aria-label*="invite" i]',
          'button[aria-label*="inviter" i]',
        ],
        semanticTokens: ['invite', 'inviter', 'add user', 'add member', 'ajouter membre'],
        actionVerbs: ['invite', 'inviter', 'add member', 'ajouter un membre', 'send invitation'],
        elementTags: ['button', 'a'],
      },
    },
  ],
};

// ============================================================================
// Marketing / lead generation blueprints
// ============================================================================

const MARKETING_LEAD_CAPTURE: JourneyBlueprint = {
  id: 'marketing.lead-capture',
  name: 'Capture de lead via formulaire de contact',
  description:
    "Conduit le visiteur depuis le CTA de la page d'accueil jusqu'au formulaire de contact et a son envoi.",
  vertical: 'marketing',
  intent: 'form-flow',
  minResolvedSteps: 2,
  priority: 10,
  steps: [
    {
      semanticRole: 'marketing.cta-hero',
      title: 'Decouvrez notre offre',
      description:
        "Le CTA principal de la page resume la valeur ajoutee. Cliquez pour entamer la prise de contact.",
      position: 'BOTTOM',
      action: 'CLICK',
      // Not strict-required: we still want the blueprint to fire on pages
      // where the contact entry point is the header link rather than a
      // hero CTA. The 2-step minimum (`minResolvedSteps`) still ensures
      // we don't generate a single-step trivial draft.
      targetHints: {
        selectorHints: [
          '[data-tour-id="hero-cta"]',
          '[data-tour-id^="cta-"]',
          'section[aria-label="hero"] button',
          'section[aria-label="hero"] a',
        ],
        semanticTokens: ['get started', 'commencer', 'demarrer', 'discover', 'decouvrir', 'try free', 'essai'],
        actionVerbs: [
          'get started',
          'commencer',
          'demarrer maintenant',
          'try free',
          'essayer',
          'request demo',
          'demander une demo',
        ],
        elementTags: ['a', 'button'],
      },
    },
    {
      semanticRole: 'marketing.contact-form',
      title: 'Remplissez le formulaire de contact',
      description:
        'Quelques informations suffisent pour vous mettre en relation avec un commercial ou recevoir une demo.',
      position: 'BOTTOM',
      action: 'CLICK',
      required: true, // contact-form remains the heart of a lead-capture funnel
      targetHints: {
        routePatterns: [
          '/contact', '/contact-us', '/get-in-touch',
          '/contactez-nous', '/nous-contacter',
          '/contacto', '/contactenos',
          '/kontakt',
          '/contatti', '/contattaci',
          '/contato', '/fale-conosco',
          '/demo', '/request-demo', '/book-demo',
        ],
        selectorHints: [
          '[data-tour-id="contact-form"]',
          '[data-tour-id="contact-link"]',
          '[data-tour-id*="contact"]',
          'form[class*="contact"]',
          'form[class*="Contact"]',
          'form[aria-label*="contact" i]',
          'a[href*="/contact"]',
          'a[href*="/demo"]',
          'a[href*="/kontakt"]',
          'a[href*="/contacto"]',
          'a[class*="contact-link"]',
        ],
        semanticTokens: [
          'contact', 'get in touch', 'reach out',
          'nous contacter', 'contactez',
          'contacto', 'contactenos',
          'kontakt', 'kontaktieren',
          'contatti', 'contattaci',
          'contato',
          'demo', 'demonstration',
        ],
        actionVerbs: [
          'contact us', 'get in touch',
          'nous contacter', 'contactez-nous',
          'contactanos',
          'kontaktiere uns',
          'contattaci',
          'fale conosco',
          'request demo', 'demander une demo',
        ],
        elementTags: ['form', 'a', 'button'],
      },
    },
    {
      semanticRole: 'marketing.newsletter-signup',
      title: 'Restez informe',
      description:
        "Inscrivez-vous a la newsletter pour suivre les nouveautes et bonnes pratiques metier.",
      position: 'TOP',
      action: 'CLICK',
      targetHints: {
        selectorHints: [
          '[data-tour-id="newsletter-form"]',
          'form[aria-label*="newsletter" i]',
          'input[type="email"][placeholder*="newsletter" i]',
        ],
        semanticTokens: ['newsletter', 'subscribe', 'inscription', 'updates', 'restez informe'],
        actionVerbs: ['subscribe', 's abonner', "s'abonner", 'inscrire', 'inscription'],
        elementTags: ['form', 'button', 'input'],
      },
    },
  ],
};

const MARKETING_DEMO_REQUEST: JourneyBlueprint = {
  id: 'marketing.demo-request',
  name: 'Demande de demonstration',
  description:
    "Parcours de prise de contact rapide pour une demo: CTA hero -> formulaire dedie -> validation.",
  vertical: 'marketing',
  intent: 'form-flow',
  minResolvedSteps: 2,
  priority: 7,
  steps: [
    {
      semanticRole: 'marketing.demo-request',
      title: 'Demandez une demo',
      description:
        "Cliquez sur le bouton dedie pour acceder au formulaire de demonstration.",
      position: 'BOTTOM',
      action: 'CLICK',
      required: true, // demo CTA is the entry point of this blueprint
      targetHints: {
        routePatterns: ['/demo', '/request-demo', '/book-demo', '/demonstration'],
        selectorHints: [
          '[data-tour-id="demo-cta"]',
          '[data-tour-id="request-demo"]',
          'a[href*="/demo"]',
          'a[href*="/request-demo"]',
        ],
        semanticTokens: ['demo', 'demonstration', 'book a demo', 'reserver une demo'],
        actionVerbs: ['request demo', 'demander une demo', 'book demo', 'reserver une demo'],
        elementTags: ['a', 'button'],
      },
    },
    {
      semanticRole: 'marketing.contact-form',
      title: 'Renseignez vos informations',
      description:
        "Renseignez quelques informations professionnelles pour que l'equipe revienne vers vous rapidement.",
      position: 'BOTTOM',
      action: 'CLICK',
      // Not required: many demo CTAs already lead to a dedicated form page,
      // so the form element itself may not be reachable from the entry page.
      targetHints: {
        selectorHints: [
          'form[aria-label*="demo" i]',
          'form[aria-label*="contact" i]',
          '[data-tour-id="demo-form"]',
        ],
        semanticTokens: ['demo form', 'demand demo', 'contact form'],
        elementTags: ['form', 'button'],
      },
    },
  ],
};

// ============================================================================
// SaaS — first-run onboarding (post-signup checklist / setup wizard)
// ============================================================================

const SAAS_ONBOARDING_CHECKLIST: JourneyBlueprint = {
  id: 'saas.onboarding-checklist',
  name: 'Onboarding initial - prise en main pas a pas',
  description:
    "Guide le nouvel utilisateur a travers les etapes de demarrage: premiere connexion, completion du profil et assistant de configuration de l'espace.",
  vertical: 'saas',
  intent: 'primary-action',
  // Conservative minimum: even on apps that skip the setup wizard, having
  // (first-login OR welcome-checklist) + profile-completion is meaningful.
  minResolvedSteps: 2,
  priority: 12,
  steps: [
    {
      semanticRole: 'saas.first-login',
      title: 'Bienvenue dans votre espace',
      description:
        "Connectez-vous pour acceder a votre nouvel environnement. Le SDK suivra votre premiere session pour vous proposer les bons reflexes.",
      position: 'BOTTOM',
      action: 'CLICK',
      targetHints: {
        routePatterns: [
          // EN
          '/login', '/signin', '/sign-in', '/welcome', '/onboarding',
          // FR
          '/connexion', '/se-connecter', '/bienvenue',
          // ES
          '/iniciar-sesion', '/acceso', '/bienvenida',
          // DE
          '/anmelden', '/willkommen',
          // IT
          '/accedi', '/benvenuto',
          // PT
          '/entrar', '/bem-vindo',
        ],
        selectorHints: [
          '[data-tour-id="login-button"]',
          '[data-tour-id="signin-button"]',
          '[data-tour-id*="login"]',
          '[data-tour-id*="signin"]',
          'a[href*="/login"]',
          'a[href*="/signin"]',
          'a[href*="/connexion"]',
          'button[class*="login"]',
          'button[class*="LoginButton"]',
          'button[aria-label*="log in" i]',
          'button[aria-label*="sign in" i]',
          'button[aria-label*="connexion" i]',
        ],
        semanticTokens: [
          'log in', 'login', 'sign in', 'signin', 'welcome',
          'connexion', 'se connecter', 'bienvenue',
          'iniciar sesion', 'acceso', 'bienvenida',
          'anmelden', 'willkommen',
          'accedi', 'benvenuto',
          'entrar', 'bem-vindo',
        ],
        actionVerbs: [
          'log in', 'sign in', 'continue',
          'se connecter', 'connexion', 'continuer',
          'iniciar sesion', 'continuar',
          'anmelden', 'fortfahren',
          'accedi', 'continua',
          'entrar', 'continuar',
        ],
        elementTags: ['a', 'button'],
      },
    },
    {
      semanticRole: 'saas.profile-completion',
      title: 'Completez votre profil',
      description:
        "Renseignez vos informations cles pour personnaliser l'experience et adapter les suggestions a votre contexte.",
      position: 'RIGHT',
      action: 'CLICK',
      // We deduce navigation to /profile only after first-login resolves, so we
      // never push users to a non-existent route on apps without a profile page.
      inferAfter: ['saas.first-login'],
      targetHints: {
        routePatterns: [
          '/profile', '/account', '/onboarding/profile',
          '/profil', '/mon-profil', '/mon-compte',
          '/perfil', '/cuenta',
          '/profil', '/konto',
          '/profilo', '/account',
          '/perfil', '/conta',
        ],
        selectorHints: [
          '[data-tour-id="profile-completion"]',
          '[data-tour-id="complete-profile"]',
          '[data-tour-id*="profile-edit"]',
          '[data-tour-id*="profile-complete"]',
          'a[href*="/profile"]',
          'a[href*="/profil"]',
          'a[href*="/perfil"]',
          'button[class*="complete-profile"]',
          'button[class*="CompleteProfile"]',
          'button[aria-label*="complete profile" i]',
          'button[aria-label*="completer profil" i]',
        ],
        semanticTokens: [
          'complete profile', 'edit profile', 'profile',
          'completer profil', 'modifier profil', 'profil',
          'completar perfil', 'editar perfil', 'perfil',
          'profil vervollstandigen', 'profil bearbeiten', 'profil',
          'completa profilo', 'modifica profilo', 'profilo',
          'completar perfil', 'editar perfil', 'perfil',
        ],
        actionVerbs: [
          'complete profile', 'finish profile', 'edit profile',
          'completer mon profil', 'terminer mon profil',
          'completar mi perfil',
          'profil vervollstandigen',
          'completa il tuo profilo',
          'completar meu perfil',
        ],
        elementTags: ['a', 'button', 'form'],
      },
    },
    {
      semanticRole: 'saas.setup-wizard',
      title: 'Lancez votre assistant de configuration',
      description:
        "L'assistant pas-a-pas vous aide a parametrer l'essentiel (organisation, integrations, preferences) avant la premiere action metier.",
      position: 'BOTTOM',
      action: 'CLICK',
      targetHints: {
        routePatterns: [
          '/setup', '/onboarding', '/wizard', '/getting-started',
          '/configuration', '/installation',
          '/configuracion',
          '/einrichtung', '/setup',
          '/configurazione',
          '/configuracao',
        ],
        selectorHints: [
          '[data-tour-id="setup-wizard"]',
          '[data-tour-id="getting-started"]',
          '[data-tour-id*="setup"]',
          '[data-tour-id*="wizard"]',
          '[data-tour-id*="onboarding"]',
          'a[href*="/setup"]',
          'a[href*="/wizard"]',
          'a[href*="/getting-started"]',
          'a[href*="/onboarding"]',
          'button[class*="setup-wizard"]',
          'button[class*="SetupWizard"]',
          'button[aria-label*="setup" i]',
          'button[aria-label*="get started" i]',
          'button[aria-label*="demarrer" i]',
        ],
        semanticTokens: [
          'setup', 'getting started', 'wizard', 'onboarding', 'quick start',
          'configuration', 'demarrage', 'assistant',
          'configuracion', 'asistente', 'comenzar',
          'einrichtung', 'einstieg', 'assistent',
          'configurazione', 'avvio', 'procedura guidata',
          'configuracao', 'inicio', 'assistente',
        ],
        actionVerbs: [
          'get started', 'start setup', 'finish setup',
          'demarrer', 'commencer la configuration',
          'comenzar configuracion',
          'einrichtung starten',
          'avvia configurazione',
          'iniciar configuracao',
        ],
        elementTags: ['a', 'button'],
      },
    },
    {
      semanticRole: 'saas.welcome-checklist',
      title: 'Suivez votre checklist de demarrage',
      description:
        "La checklist regroupe les actions essentielles. Cochez-les a votre rythme pour activer rapidement votre espace.",
      position: 'LEFT',
      action: 'NEXT',
      targetHints: {
        selectorHints: [
          '[data-tour-id="welcome-checklist"]',
          '[data-tour-id="onboarding-checklist"]',
          '[data-tour-id*="checklist"]',
          'section[class*="checklist"]',
          'section[class*="Checklist"]',
          'div[class*="OnboardingChecklist"]',
          'div[aria-label*="checklist" i]',
        ],
        semanticTokens: [
          'checklist', 'todo list', 'tasks',
          'liste de taches', 'a faire',
          'lista de tareas', 'tareas',
          'aufgabenliste', 'aufgaben',
          'lista attivita',
          'lista de tarefas',
        ],
        elementTags: ['a', 'button'],
      },
    },
  ],
};

// ============================================================================
// SaaS — feature discovery & change communication
// ============================================================================

const SAAS_FEATURE_DISCOVERY: JourneyBlueprint = {
  id: 'saas.feature-discovery',
  name: 'Decouverte des nouvelles fonctionnalites',
  description:
    "Met en avant les annonces produit, les info-bulles contextuelles et le changelog pour faire connaitre les nouveautes a l'utilisateur recurrent.",
  vertical: 'saas',
  intent: 'discovery',
  minResolvedSteps: 2,
  priority: 6,
  steps: [
    {
      semanticRole: 'saas.feature-announcement',
      title: 'Decouvrez les nouveautes',
      description:
        "Une nouvelle fonctionnalite est disponible. Cliquez pour en lire le detail avant de la mettre en pratique.",
      position: 'BOTTOM',
      action: 'CLICK',
      required: true,
      targetHints: {
        selectorHints: [
          '[data-tour-id="feature-announcement"]',
          '[data-tour-id="new-feature"]',
          '[data-tour-id="whats-new"]',
          '[data-tour-id*="announcement"]',
          '[data-tour-id*="new-feature"]',
          '[data-tour-id*="whats-new"]',
          'div[class*="announcement-banner"]',
          'div[class*="AnnouncementBanner"]',
          'div[class*="feature-banner"]',
          'div[class*="WhatsNew"]',
          'aside[class*="announcement"]',
          'span[class*="badge-new"]',
          'span[class*="NewBadge"]',
          'div[aria-label*="announcement" i]',
          'div[aria-label*="what\'s new" i]',
        ],
        semanticTokens: [
          'new', 'whats new', "what's new", 'announcement', 'new feature', 'release',
          'nouveau', 'nouveautes', 'annonce', 'nouvelle fonctionnalite',
          'nuevo', 'novedades', 'anuncio', 'nueva funcion',
          'neu', 'neuigkeiten', 'ankundigung', 'neue funktion',
          'novita', 'annuncio', 'nuova funzionalita',
          'novo', 'novidades', 'nova funcionalidade',
        ],
        actionVerbs: [
          'see whats new', "see what's new", 'discover',
          'voir les nouveautes', 'decouvrir',
          'ver novedades', 'descubrir',
          'neuigkeiten ansehen', 'entdecken',
          'scopri le novita',
          'ver novidades', 'descobrir',
        ],
        elementTags: ['a', 'button'],
      },
    },
    {
      semanticRole: 'saas.feature-tooltip',
      title: 'Survolez les zones marquees pour en savoir plus',
      description:
        "Les pastilles 'New' / 'Beta' signalent les blocs concernes. Une info-bulle vous explique l'usage et la valeur ajoutee.",
      position: 'RIGHT',
      action: 'NEXT',
      targetHints: {
        selectorHints: [
          '[data-tour-id="feature-tooltip"]',
          '[data-tour-id="new-feature-highlight"]',
          '[data-tour-id*="highlight"]',
          'span[class*="badge-new"]',
          'span[class*="badge-beta"]',
          'span[class*="NewBadge"]',
          'span[class*="BetaBadge"]',
          'div[class*="feature-highlight"]',
          'div[class*="FeatureHighlight"]',
          '[data-feature-flag]',
          '[data-new-badge]',
          '[aria-describedby*="new"]',
        ],
        semanticTokens: [
          'new', 'beta', 'preview', 'try it', 'try now',
          'nouveau', 'beta', 'apercu', 'essayer',
          'nuevo', 'beta', 'vista previa', 'probar',
          'neu', 'beta', 'vorschau', 'ausprobieren',
          'nuovo', 'beta', 'anteprima', 'prova',
          'novo', 'beta', 'experimentar',
        ],
        actionVerbs: [
          'try it now', 'try now', 'explore feature',
          'essayer maintenant', 'tester la fonctionnalite',
          'probar ahora',
          'jetzt ausprobieren',
          'prova ora',
          'experimentar agora',
        ],
        elementTags: ['a', 'button'],
      },
    },
    {
      semanticRole: 'saas.changelog',
      title: 'Consultez le journal des changements',
      description:
        "Le changelog regroupe toutes les ameliorations recentes, classees par date. Idee pour rattraper plusieurs releases.",
      position: 'BOTTOM',
      action: 'CLICK',
      targetHints: {
        routePatterns: [
          '/changelog', '/release-notes', '/updates', '/whats-new',
          '/journal-des-modifications', '/nouveautes',
          '/registro-de-cambios', '/novedades',
          '/anderungsprotokoll', '/neuigkeiten',
          '/registro-modifiche', '/novita',
          '/registro-de-alteracoes', '/novidades',
        ],
        selectorHints: [
          '[data-tour-id="changelog"]',
          '[data-tour-id="release-notes"]',
          'a[href*="/changelog"]',
          'a[href*="/release-notes"]',
          'a[href*="/updates"]',
          'a[href*="/whats-new"]',
          'a[class*="changelog-link"]',
          'a[aria-label*="changelog" i]',
          'a[aria-label*="release notes" i]',
        ],
        semanticTokens: [
          'changelog', 'release notes', 'updates', 'whats new', "what's new",
          'journal des modifications', 'notes de version', 'nouveautes',
          'registro de cambios', 'notas de la version', 'novedades',
          'anderungsprotokoll', 'versionshinweise', 'neuigkeiten',
          'registro modifiche', 'note di rilascio', 'novita',
          'registro de alteracoes', 'notas da versao', 'novidades',
        ],
        actionVerbs: [
          'view changelog', 'see release notes', 'open updates',
          'voir le changelog', 'consulter les nouveautes',
          'ver registro de cambios',
          'changelog ansehen',
          'visualizza changelog',
          'ver registro de alteracoes',
        ],
        elementTags: ['a', 'button'],
      },
    },
  ],
};

// ============================================================================
// Account & Settings management (billing, security, plan upgrade)
// ============================================================================

const ACCOUNT_SETTINGS_MANAGEMENT: JourneyBlueprint = {
  id: 'account.settings-management',
  name: 'Gestion du compte et des parametres',
  description:
    "Aide a la gestion du compte: ouvrir les parametres, ajuster les notifications, securiser le compte (2FA, mot de passe), gerer la facturation et l'abonnement.",
  vertical: 'saas',
  intent: 'support-navigation',
  // Settings deeply varies per app: the resolver only needs to land on the
  // settings hub + one configurable section (notifications OR security OR
  // billing) to deliver value.
  minResolvedSteps: 2,
  priority: 8,
  steps: [
    {
      semanticRole: 'saas.open-settings',
      title: 'Ouvrez vos parametres',
      description:
        "Acceder au hub des parametres pour gerer profil, notifications, securite et facturation depuis un seul endroit.",
      position: 'RIGHT',
      action: 'CLICK',
      required: true,
      targetHints: {
        routePatterns: [
          // EN
          '/settings', '/account/settings', '/preferences', '/config',
          // FR
          '/parametres', '/reglages', '/preferences',
          // ES
          '/configuracion', '/ajustes', '/preferencias',
          // DE
          '/einstellungen', '/voreinstellungen',
          // IT
          '/impostazioni', '/preferenze',
          // PT
          '/configuracoes', '/preferencias',
        ],
        selectorHints: [
          '[data-tour-id="settings-link"]',
          '[data-tour-id="open-settings"]',
          '[data-tour-id*="settings"]',
          '[data-tour-id*="preferences"]',
          'a[href*="/settings"]',
          'a[href*="/parametres"]',
          'a[href*="/configuracion"]',
          'a[href*="/einstellungen"]',
          'a[href*="/impostazioni"]',
          'a[href*="/configuracoes"]',
          'button[aria-label*="settings" i]',
          'button[aria-label*="parametres" i]',
          'button[aria-label*="ajustes" i]',
          'button[aria-label*="einstellungen" i]',
        ],
        semanticTokens: [
          'settings', 'preferences', 'configuration',
          'parametres', 'reglages',
          'configuracion', 'ajustes',
          'einstellungen', 'voreinstellungen',
          'impostazioni', 'preferenze',
          'configuracoes',
        ],
        actionVerbs: [
          'open settings', 'manage settings',
          'ouvrir les parametres', 'gerer les parametres',
          'abrir configuracion',
          'einstellungen offnen',
          'apri impostazioni',
          'abrir configuracoes',
        ],
        elementTags: ['a', 'button'],
      },
    },
    {
      semanticRole: 'account.notifications',
      title: 'Ajustez vos notifications',
      description:
        "Choisissez les emails et alertes que vous voulez recevoir. Diminue le bruit sans rater l'essentiel.",
      position: 'BOTTOM',
      action: 'CLICK',
      inferAfter: ['saas.open-settings'],
      targetHints: {
        routePatterns: [
          '/settings/notifications', '/notifications',
          '/parametres/notifications',
          '/configuracion/notificaciones', '/notificaciones',
          '/einstellungen/benachrichtigungen', '/benachrichtigungen',
          '/impostazioni/notifiche', '/notifiche',
          '/configuracoes/notificacoes', '/notificacoes',
        ],
        selectorHints: [
          '[data-tour-id="notifications-settings"]',
          '[data-tour-id="settings-notifications"]',
          '[data-tour-id*="notifications"]',
          'a[href*="/notifications"]',
          'a[href*="/notificaciones"]',
          'a[href*="/benachrichtigungen"]',
          'a[href*="/notifiche"]',
          'a[class*="notifications-link"]',
          'button[aria-label*="notifications" i]',
        ],
        semanticTokens: [
          'notifications', 'alerts', 'email preferences',
          'notifications', 'alertes',
          'notificaciones', 'alertas',
          'benachrichtigungen', 'warnungen',
          'notifiche', 'avvisi',
          'notificacoes', 'alertas',
        ],
        actionVerbs: [
          'manage notifications', 'configure alerts',
          'gerer les notifications', 'configurer les alertes',
          'gestionar notificaciones',
          'benachrichtigungen verwalten',
          'gestisci notifiche',
          'gerenciar notificacoes',
        ],
        elementTags: ['a', 'button'],
      },
    },
    {
      semanticRole: 'account.security',
      title: 'Securisez votre compte',
      description:
        "Mot de passe robuste, double authentification, sessions actives: revoyez les controles cles de securite de votre compte.",
      position: 'BOTTOM',
      action: 'CLICK',
      inferAfter: ['saas.open-settings'],
      targetHints: {
        routePatterns: [
          '/settings/security', '/security', '/account/security',
          '/parametres/securite', '/securite',
          '/configuracion/seguridad', '/seguridad',
          '/einstellungen/sicherheit', '/sicherheit',
          '/impostazioni/sicurezza', '/sicurezza',
          '/configuracoes/seguranca', '/seguranca',
        ],
        selectorHints: [
          '[data-tour-id="security-settings"]',
          '[data-tour-id="settings-security"]',
          '[data-tour-id*="security"]',
          '[data-tour-id*="2fa"]',
          '[data-tour-id*="two-factor"]',
          'a[href*="/security"]',
          'a[href*="/securite"]',
          'a[href*="/seguridad"]',
          'a[href*="/sicherheit"]',
          'a[href*="/sicurezza"]',
          'a[href*="/seguranca"]',
          'button[aria-label*="security" i]',
          'button[aria-label*="two-factor" i]',
          'button[aria-label*="2fa" i]',
        ],
        semanticTokens: [
          'security', 'two-factor', '2fa', 'password',
          'securite', 'double authentification', 'mot de passe',
          'seguridad', 'autenticacion de dos factores', 'contrasena',
          'sicherheit', 'zwei-faktor-authentifizierung', 'passwort',
          'sicurezza', 'autenticazione a due fattori', 'password',
          'seguranca', 'autenticacao de dois fatores', 'senha',
        ],
        actionVerbs: [
          'secure account', 'enable 2fa', 'change password',
          'securiser le compte', 'activer la 2fa', 'changer mot de passe',
          'asegurar cuenta', 'cambiar contrasena',
          'konto sichern', 'passwort andern',
          'proteggi account', 'cambia password',
          'proteger conta', 'alterar senha',
        ],
        elementTags: ['a', 'button'],
      },
    },
    {
      semanticRole: 'account.billing',
      title: 'Consultez votre facturation',
      description:
        "Visualisez vos factures, votre methode de paiement et l'historique de prelevements. Centralisez la gestion financiere de votre compte.",
      position: 'BOTTOM',
      action: 'CLICK',
      inferAfter: ['saas.open-settings'],
      targetHints: {
        routePatterns: [
          '/billing', '/settings/billing', '/account/billing', '/invoices',
          '/facturation', '/factures',
          '/facturacion', '/facturas',
          '/abrechnung', '/rechnungen',
          '/fatturazione', '/fatture',
          '/faturamento', '/faturas', '/cobranca',
        ],
        selectorHints: [
          '[data-tour-id="billing-link"]',
          '[data-tour-id="settings-billing"]',
          '[data-tour-id*="billing"]',
          '[data-tour-id*="invoices"]',
          'a[href*="/billing"]',
          'a[href*="/facturation"]',
          'a[href*="/facturacion"]',
          'a[href*="/abrechnung"]',
          'a[href*="/fatturazione"]',
          'a[href*="/faturamento"]',
          'a[href*="/cobranca"]',
          'a[class*="billing-link"]',
          'button[aria-label*="billing" i]',
        ],
        semanticTokens: [
          'billing', 'invoices', 'payment',
          'facturation', 'factures', 'paiement',
          'facturacion', 'facturas', 'pago',
          'abrechnung', 'rechnungen', 'zahlung',
          'fatturazione', 'fatture', 'pagamento',
          'faturamento', 'faturas', 'cobranca', 'pagamento',
        ],
        actionVerbs: [
          'manage billing', 'view invoices',
          'gerer la facturation', 'voir les factures',
          'administrar facturacion',
          'abrechnung verwalten',
          'gestisci fatturazione',
          'gerenciar faturamento',
        ],
        elementTags: ['a', 'button'],
      },
    },
    {
      semanticRole: 'account.plan-upgrade',
      title: 'Faites evoluer votre offre',
      description:
        "Comparez les plans et passez a un palier superieur pour debloquer les fonctionnalites avancees adaptees a votre usage.",
      position: 'BOTTOM',
      action: 'CLICK',
      inferAfter: ['saas.open-settings', 'account.billing'],
      targetHints: {
        routePatterns: [
          '/plans', '/pricing', '/upgrade', '/settings/plan',
          '/abonnement', '/tarifs', '/forfait',
          '/planes', '/precios', '/mejorar',
          '/preise', '/tarif', '/upgrade',
          '/piani', '/prezzi', '/aggiorna',
          '/planos', '/precos',
        ],
        selectorHints: [
          '[data-tour-id="upgrade-plan"]',
          '[data-tour-id="plan-upgrade"]',
          '[data-tour-id="pricing-link"]',
          '[data-tour-id*="upgrade"]',
          '[data-tour-id*="pricing"]',
          'a[href*="/upgrade"]',
          'a[href*="/pricing"]',
          'a[href*="/plans"]',
          'a[href*="/abonnement"]',
          'a[href*="/tarifs"]',
          'a[href*="/planes"]',
          'a[href*="/preise"]',
          'a[href*="/piani"]',
          'a[href*="/planos"]',
          'button[class*="upgrade"]',
          'button[class*="UpgradeButton"]',
          'button[aria-label*="upgrade" i]',
        ],
        semanticTokens: [
          'upgrade', 'plan', 'pricing', 'subscribe', 'premium',
          'mise a niveau', 'forfait', 'tarifs', 'abonnement', 'premium',
          'mejorar', 'plan', 'precios', 'suscripcion',
          'upgraden', 'tarif', 'preise', 'abonnement',
          'aggiornare', 'piano', 'prezzi', 'abbonamento',
          'atualizar', 'plano', 'precos', 'assinatura',
        ],
        actionVerbs: [
          'upgrade plan', 'go premium', 'compare plans',
          'changer de forfait', 'passer premium',
          'mejorar plan',
          'plan upgraden',
          'aggiorna piano',
          'atualizar plano',
        ],
        elementTags: ['a', 'button'],
      },
    },
  ],
};

// ============================================================================
// Dashboard / Analytics blueprints
// ============================================================================

const DASHBOARD_ANALYTICS_EXPLORATION: JourneyBlueprint = {
  id: 'dashboard.analytics-exploration',
  name: 'Exploration des donnees du tableau de bord',
  description:
    "Apprend a l'utilisateur a affiner ses analyses: appliquer un filtre, choisir une periode, explorer un graphique et exporter le resultat.",
  vertical: 'dashboard',
  intent: 'support-navigation',
  // 2 steps minimum: a useful analytics tour needs at least 1 filter
  // interaction + 1 result action (chart explore or export).
  minResolvedSteps: 2,
  priority: 10,
  steps: [
    {
      semanticRole: 'dashboard.kpi-overview',
      title: 'Vue d ensemble des indicateurs',
      description:
        "Les KPIs en haut du tableau resument votre activite. Familiarisez-vous avec eux avant d'affiner.",
      position: 'BOTTOM',
      action: 'NEXT',
      targetHints: {
        selectorHints: [
          '[data-tour-id="kpi-overview"]',
          '[data-tour-id="kpi-card"]',
          '[data-tour-id*="kpi"]',
          '[data-tour-id*="metric-card"]',
          'div[class*="kpi-card"]',
          'div[class*="KpiCard"]',
          'div[class*="MetricCard"]',
          'div[class*="StatCard"]',
          'section[aria-label*="kpi" i]',
          'section[aria-label*="metrics" i]',
        ],
        semanticTokens: [
          'kpi', 'metric', 'metrics', 'overview', 'summary', 'stats',
          'kpi', 'indicateurs', 'apercu', 'resume', 'statistiques',
          'kpi', 'metricas', 'resumen', 'estadisticas',
          'kpi', 'kennzahlen', 'ubersicht', 'statistik',
          'kpi', 'metriche', 'panoramica', 'statistiche',
          'kpi', 'metricas', 'visao geral', 'estatisticas',
        ],
        elementTags: ['a', 'button'],
      },
    },
    {
      semanticRole: 'dashboard.filter-panel',
      title: 'Appliquez vos filtres',
      description:
        "Le panneau de filtres permet de cibler une dimension (segment, statut, etc.) et de recalculer les indicateurs instantanement.",
      position: 'RIGHT',
      action: 'CLICK',
      required: true,
      targetHints: {
        selectorHints: [
          '[data-tour-id="filter-panel"]',
          '[data-tour-id="filters"]',
          '[data-tour-id*="filter"]',
          'button[class*="filter-toggle"]',
          'button[class*="FilterToggle"]',
          'button[class*="FilterButton"]',
          'aside[class*="filters"]',
          'aside[class*="FilterPanel"]',
          'div[class*="filter-panel"]',
          'button[aria-label*="filter" i]',
          'button[aria-label*="filtrer" i]',
          'button[aria-label*="filtro" i]',
          'button[aria-haspopup="listbox"]',
        ],
        semanticTokens: [
          'filter', 'filters', 'segment', 'apply filter',
          'filtre', 'filtres', 'segment', 'appliquer un filtre',
          'filtro', 'filtros', 'segmento',
          'filter', 'filtern', 'segment',
          'filtro', 'filtri', 'segmento',
          'filtro', 'filtros', 'segmento',
        ],
        actionVerbs: [
          'apply filter', 'add filter', 'filter results',
          'appliquer un filtre', 'ajouter un filtre', 'filtrer',
          'aplicar filtro', 'agregar filtro',
          'filter anwenden',
          'applica filtro',
          'aplicar filtro',
        ],
        elementTags: ['button', 'a', 'select'],
      },
    },
    {
      semanticRole: 'dashboard.date-picker',
      title: 'Choisissez votre periode',
      description:
        "Selectionnez la plage de dates pour ajuster la fenetre d'analyse. Le tableau de bord se met a jour automatiquement.",
      position: 'BOTTOM',
      action: 'CLICK',
      targetHints: {
        selectorHints: [
          '[data-tour-id="date-picker"]',
          '[data-tour-id="date-range"]',
          '[data-tour-id*="date-picker"]',
          '[data-tour-id*="date-range"]',
          'button[class*="date-picker"]',
          'button[class*="DatePicker"]',
          'button[class*="DateRangePicker"]',
          'div[class*="date-range"]',
          'input[type="date"]',
          'button[aria-label*="date" i]',
          'button[aria-label*="period" i]',
          'button[aria-label*="periode" i]',
          'button[aria-label*="fecha" i]',
          'button[aria-label*="datum" i]',
        ],
        semanticTokens: [
          'date', 'date range', 'period', 'time range',
          'date', 'periode', 'plage de dates',
          'fecha', 'rango de fechas', 'periodo',
          'datum', 'zeitraum', 'datumsbereich',
          'data', 'periodo', 'intervallo di date',
          'data', 'periodo', 'intervalo de datas',
        ],
        actionVerbs: [
          'select date', 'pick date', 'change period',
          'choisir la date', 'changer la periode',
          'seleccionar fecha',
          'datum auswahlen',
          'seleziona data',
          'selecionar data',
        ],
        elementTags: ['button', 'input', 'select'],
      },
    },
    {
      semanticRole: 'dashboard.chart-explore',
      title: 'Explorez le graphique',
      description:
        "Survolez ou cliquez sur le graphique pour voir le detail d'une serie, basculer entre les types ou comparer des periodes.",
      position: 'TOP',
      action: 'NEXT',
      targetHints: {
        selectorHints: [
          '[data-tour-id="chart"]',
          '[data-tour-id*="chart"]',
          '[data-tour-id*="graph"]',
          'svg[class*="chart"]',
          'svg[class*="Chart"]',
          'svg[class*="recharts"]',
          'div[class*="chart-container"]',
          'div[class*="ChartContainer"]',
          'div[class*="recharts-wrapper"]',
          'canvas[class*="chartjs"]',
          'section[aria-label*="chart" i]',
          'section[aria-label*="graphique" i]',
          'section[aria-label*="grafico" i]',
        ],
        semanticTokens: [
          'chart', 'graph', 'visualization', 'analytics',
          'graphique', 'visualisation', 'analyse',
          'grafico', 'visualizacion', 'analitica',
          'diagramm', 'visualisierung', 'analyse',
          'grafico', 'visualizzazione', 'analisi',
          'grafico', 'visualizacao', 'analise',
        ],
        elementTags: ['a', 'button'],
      },
    },
    {
      semanticRole: 'dashboard.export-data',
      title: 'Exportez vos resultats',
      description:
        "Telechargez l'analyse en CSV, Excel ou PDF pour la partager, l'archiver ou poursuivre l'exploration dans un autre outil.",
      position: 'LEFT',
      action: 'CLICK',
      targetHints: {
        selectorHints: [
          '[data-tour-id="export-button"]',
          '[data-tour-id="export-data"]',
          '[data-tour-id*="export"]',
          '[data-tour-id*="download"]',
          'button[class*="export-button"]',
          'button[class*="ExportButton"]',
          'button[class*="DownloadButton"]',
          'a[download]',
          'a[href*="export"]',
          'a[href*=".csv"]',
          'a[href*=".pdf"]',
          'a[href*=".xlsx"]',
          'button[aria-label*="export" i]',
          'button[aria-label*="download" i]',
          'button[aria-label*="exporter" i]',
          'button[aria-label*="telecharger" i]',
          'button[aria-label*="exportar" i]',
          'button[aria-label*="esportare" i]',
        ],
        semanticTokens: [
          'export', 'download', 'csv', 'xlsx', 'pdf',
          'exporter', 'telecharger',
          'exportar', 'descargar',
          'exportieren', 'herunterladen',
          'esportare', 'scaricare',
          'exportar', 'baixar',
        ],
        actionVerbs: [
          'export', 'export data', 'download report', 'export csv',
          'exporter', 'telecharger le rapport',
          'exportar', 'descargar informe',
          'exportieren', 'bericht herunterladen',
          'esportare', 'scarica report',
          'exportar', 'baixar relatorio',
        ],
        elementTags: ['button', 'a'],
      },
    },
  ],
};

// ============================================================================
// Support / Help blueprints
// ============================================================================

const SUPPORT_HELP_NAVIGATION: JourneyBlueprint = {
  id: 'support.help-navigation',
  name: 'Navigation dans l aide et le support',
  description:
    "Oriente l'utilisateur dans le centre d'aide: chercher dans la FAQ, ouvrir la documentation guidee, creer un ticket support en dernier recours.",
  vertical: 'support',
  intent: 'support-navigation',
  minResolvedSteps: 2,
  priority: 9,
  steps: [
    {
      semanticRole: 'support.faq-navigation',
      title: 'Cherchez dans la FAQ',
      description:
        "La FAQ regroupe les questions les plus frequentes. Souvent la reponse y est en quelques clics, plus rapide qu'un ticket.",
      position: 'BOTTOM',
      action: 'CLICK',
      targetHints: {
        routePatterns: [
          // EN
          '/faq', '/help', '/help-center', '/support', '/knowledge-base',
          // FR
          '/aide', '/centre-aide', '/foire-aux-questions', '/base-de-connaissances',
          // ES
          '/ayuda', '/centro-ayuda', '/preguntas-frecuentes',
          // DE
          '/hilfe', '/hilfe-center', '/haufige-fragen',
          // IT
          '/aiuto', '/centro-assistenza', '/domande-frequenti',
          // PT
          '/ajuda', '/central-ajuda', '/perguntas-frequentes',
        ],
        selectorHints: [
          '[data-tour-id="faq-link"]',
          '[data-tour-id="help-link"]',
          '[data-tour-id*="faq"]',
          '[data-tour-id*="help-center"]',
          'a[href*="/faq"]',
          'a[href*="/help"]',
          'a[href*="/support"]',
          'a[href*="/aide"]',
          'a[href*="/ayuda"]',
          'a[href*="/hilfe"]',
          'a[href*="/aiuto"]',
          'a[href*="/ajuda"]',
          'a[class*="faq-link"]',
          'a[class*="help-link"]',
          'a[aria-label*="help" i]',
          'a[aria-label*="aide" i]',
          'a[aria-label*="ayuda" i]',
          'a[aria-label*="hilfe" i]',
          'a[aria-label*="aiuto" i]',
          'a[aria-label*="ajuda" i]',
        ],
        semanticTokens: [
          'faq', 'help', 'help center', 'support', 'knowledge base',
          'aide', "centre d'aide", 'foire aux questions',
          'ayuda', 'centro de ayuda', 'preguntas frecuentes',
          'hilfe', 'hilfe-center', 'haufige fragen',
          'aiuto', 'centro assistenza', 'domande frequenti',
          'ajuda', 'central de ajuda', 'perguntas frequentes',
        ],
        actionVerbs: [
          'browse faq', 'open help', 'search help',
          'consulter la faq', 'ouvrir l aide',
          'consultar faq', 'abrir ayuda',
          'faq durchsuchen', 'hilfe offnen',
          'consulta faq', 'apri aiuto',
          'consultar faq', 'abrir ajuda',
        ],
        elementTags: ['a', 'button'],
      },
    },
    {
      semanticRole: 'support.docs-guided',
      title: 'Suivez la documentation guidee',
      description:
        "La documentation pas-a-pas explique chaque fonctionnalite avec des exemples concrets. Pratique avant d'ouvrir un ticket.",
      position: 'RIGHT',
      action: 'CLICK',
      targetHints: {
        routePatterns: [
          // EN
          '/docs', '/documentation', '/guides', '/tutorials', '/manual',
          // FR
          '/documentation', '/guides', '/tutoriels', '/manuel',
          // ES
          '/documentacion', '/guias', '/tutoriales',
          // DE
          '/dokumentation', '/anleitungen', '/handbuch',
          // IT
          '/documentazione', '/guide', '/manuale',
          // PT
          '/documentacao', '/guias', '/tutoriais', '/manual',
        ],
        selectorHints: [
          '[data-tour-id="docs-link"]',
          '[data-tour-id="documentation"]',
          '[data-tour-id*="docs"]',
          '[data-tour-id*="documentation"]',
          'a[href*="/docs"]',
          'a[href*="/documentation"]',
          'a[href*="/guides"]',
          'a[href*="/tutorials"]',
          'a[href*="/manual"]',
          'a[class*="docs-link"]',
          'a[aria-label*="docs" i]',
          'a[aria-label*="documentation" i]',
        ],
        semanticTokens: [
          'docs', 'documentation', 'guide', 'tutorial', 'manual',
          'documentation', 'guide', 'tutoriel', 'manuel',
          'documentacion', 'guia', 'tutorial',
          'dokumentation', 'anleitung', 'handbuch',
          'documentazione', 'guida', 'manuale',
          'documentacao', 'guia', 'tutorial',
        ],
        actionVerbs: [
          'read docs', 'browse documentation',
          'lire la documentation', 'consulter le guide',
          'leer documentacion',
          'dokumentation lesen',
          'leggi documentazione',
          'ler documentacao',
        ],
        elementTags: ['a', 'button'],
      },
    },
    {
      semanticRole: 'support.ticket-create',
      title: 'Ouvrez un ticket de support',
      description:
        "Decrivez votre probleme en quelques lignes: notre equipe revient vers vous avec une reponse personnalisee.",
      position: 'BOTTOM',
      action: 'CLICK',
      targetHints: {
        routePatterns: [
          // EN
          '/support/new', '/tickets/new', '/contact-support', '/help/contact',
          // FR
          '/support/nouveau', '/tickets/nouveau', '/contacter-support', '/aide/contact',
          // ES
          '/soporte/nuevo', '/tickets/nuevo', '/contactar-soporte',
          // DE
          '/support/neu', '/tickets/neu', '/support-kontaktieren',
          // IT
          '/supporto/nuovo', '/tickets/nuovo', '/contatta-supporto',
          // PT
          '/suporte/novo', '/tickets/novo', '/contatar-suporte',
        ],
        selectorHints: [
          '[data-tour-id="open-ticket"]',
          '[data-tour-id="create-ticket"]',
          '[data-tour-id="new-ticket"]',
          '[data-tour-id*="ticket"]',
          '[data-tour-id*="support-form"]',
          'a[href*="/ticket"]',
          'a[href*="/support/new"]',
          'a[href*="/contact-support"]',
          'button[class*="open-ticket"]',
          'button[class*="OpenTicket"]',
          'button[class*="CreateTicket"]',
          'button[class*="ContactSupport"]',
          'button[aria-label*="ticket" i]',
          'button[aria-label*="contact support" i]',
          'button[aria-label*="contacter support" i]',
        ],
        semanticTokens: [
          'ticket', 'support request', 'contact support', 'open ticket',
          'ticket', 'demande de support', 'contacter le support',
          'ticket', 'solicitud de soporte', 'contactar soporte',
          'ticket', 'support-anfrage', 'support kontaktieren',
          'ticket', 'richiesta supporto', 'contatta supporto',
          'ticket', 'pedido de suporte', 'contatar suporte',
        ],
        actionVerbs: [
          'open ticket', 'create ticket', 'contact support',
          'ouvrir un ticket', 'creer un ticket', 'contacter le support',
          'abrir ticket', 'crear ticket',
          'ticket erstellen', 'support kontaktieren',
          'apri ticket', 'crea ticket',
          'abrir ticket', 'criar ticket',
        ],
        elementTags: ['a', 'button'],
      },
    },
    {
      semanticRole: 'support.contact-help',
      title: 'Contactez l aide en direct',
      description:
        "Pour les questions plus complexes, joignez un agent via chat live ou email. Ideal quand la documentation ne suffit pas.",
      position: 'LEFT',
      action: 'CLICK',
      targetHints: {
        selectorHints: [
          '[data-tour-id="live-chat"]',
          '[data-tour-id="contact-help"]',
          '[data-tour-id*="live-chat"]',
          '[data-tour-id*="chat-widget"]',
          'button[class*="live-chat"]',
          'button[class*="LiveChat"]',
          'button[class*="ChatWidget"]',
          'div[class*="intercom-launcher"]',
          'div[class*="ZendeskWidget"]',
          'div[class*="HelpWidget"]',
          'button[aria-label*="chat" i]',
          'button[aria-label*="live chat" i]',
          'button[aria-label*="contact help" i]',
        ],
        semanticTokens: [
          'live chat', 'chat', 'contact help', 'talk to us',
          'chat en direct', 'discuter', 'nous joindre',
          'chat en vivo', 'hablar con nosotros',
          'live-chat', 'kontakt aufnehmen',
          'chat dal vivo', 'parla con noi',
          'chat ao vivo', 'fale conosco',
        ],
        actionVerbs: [
          'chat with us', 'talk to support',
          'discuter avec nous', 'parler au support',
          'chatear con nosotros',
          'mit uns chatten',
          'chatta con noi',
          'falar conosco',
        ],
        elementTags: ['button', 'a'],
      },
    },
  ],
};

// ============================================================================
// Catalog assembly
// ============================================================================

// NOTE: We use `Partial<Record<...>>` instead of `Record<...>` because the
// `tech`, `hr`, `social`, `elearning`, `realestate`, `fintech` and `healthtech`
// verticals are intentionally NOT built-in: they ship as tree-shakeable opt-in
// packs under `@trustdev/onboarding-sdk-react/packs`, imported by the host
// app and passed via `journeyBlueprints`. Listing them here as empty arrays
// would bloat the runtime check in `selectActiveBlueprints` for no gain.
const BUILTIN_BLUEPRINTS: Partial<Record<JourneyVertical, JourneyBlueprint[]>> = {
  ecommerce: [ECOMMERCE_PURCHASE_JOURNEY, ECOMMERCE_ACCOUNT_ONBOARDING],
  saas: [
    SAAS_FIRST_RESOURCE,
    SAAS_TEAM_INVITE,
    SAAS_ONBOARDING_CHECKLIST,
    SAAS_FEATURE_DISCOVERY,
    ACCOUNT_SETTINGS_MANAGEMENT,
  ],
  marketing: [MARKETING_LEAD_CAPTURE, MARKETING_DEMO_REQUEST],
  dashboard: [DASHBOARD_ANALYTICS_EXPLORATION],
  support: [SUPPORT_HELP_NAVIGATION],
};

/**
 * Returns the union of built-in blueprints for the requested verticals plus
 * any custom blueprints supplied by the host application. Custom blueprints
 * are appended after the built-ins so that, in case of duplicate IDs, the
 * built-ins win and the host can still inspect what they overrode (we don't
 * silently dedupe — the resolver will treat IDs as opaque labels).
 */
export function selectActiveBlueprints(
  verticals: JourneyVertical[] | undefined,
  customBlueprints: JourneyBlueprint[] | undefined,
): JourneyBlueprint[] {
  const result: JourneyBlueprint[] = [];
  if (verticals && verticals.length > 0) {
    for (const vertical of verticals) {
      const builtins = BUILTIN_BLUEPRINTS[vertical];
      if (builtins) {
        result.push(...builtins);
      }
    }
  }
  if (customBlueprints && customBlueprints.length > 0) {
    result.push(...customBlueprints);
  }
  return result;
}

/**
 * Returns the full built-in catalog grouped by vertical. Useful for the debug
 * panel. Opt-in verticals (tech / hr / social / elearning / realestate /
 * fintech / healthtech) are intentionally NOT included here — they live in
 * `@trustdev/onboarding-sdk-react/packs` and must be imported explicitly.
 */
export function getBuiltinBlueprintsByVertical(): Partial<Record<JourneyVertical, JourneyBlueprint[]>> {
  return BUILTIN_BLUEPRINTS;
}
