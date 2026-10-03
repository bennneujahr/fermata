// JSX-Typ für das Web Component <fermata-atem> aus packages/brand.
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "fermata-atem": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { state?: string; label?: string };
    }
  }
}

export {};
