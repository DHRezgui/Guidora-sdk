/**
 * Trouve un élément dans le DOM selon un sélecteur
 */
export const findElement = (selector: string): HTMLElement | null => {
  if (!selector) return null;
  try {
    return document.querySelector(selector);
  } catch (error) {
    console.warn('[TrustDev SDK] Invalid selector:', selector);
    return null;
  }
};

/**
 * Calcule la position d'un élément par rapport au viewport
 */
export const getElementPosition = (element: HTMLElement) => {
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top + window.scrollY,
    left: rect.left + window.scrollX,
    width: rect.width,
    height: rect.height,
  };
};