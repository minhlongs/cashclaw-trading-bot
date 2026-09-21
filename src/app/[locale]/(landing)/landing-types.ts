export interface Feature {
  icon: string;
  title: string;
  desc: string;
}

export interface Stat {
  value: string;
  label: string;
}

export interface Step {
  n: string;
  title: string;
  desc: string;
}

export interface PricingPlan {
  name: string;
  price: string;
  unit: string;
  features: string[];
  cta: string;
  popular?: boolean;
}
