export interface FaqItem {
  question: string;
  answer: string;
}

// IMPORTANT: this is the ONLY place FAQ copy lives. The visible accordion
// and the FAQPage JSON-LD schema both render from this array. Editing the
// text here updates both automatically — never hardcode FAQ copy directly
// into a page or into a separate schema block, or the two will drift and
// undermine the whole point of having structured data for AI answer engines.
export const faqItems: FaqItem[] = [
  {
    question:
      'My home insurance went up. Can I get a cheaper rate, and what inspections would I need?',
    answer:
      'Often you can, and it is worth asking. A Florida homeowner who thinks their premium is too high can call their insurance agent and ask them to shop other carriers for the same house. If a cheaper carrier is available, that carrier will almost always require a current 4-point inspection before it will write the policy, and a wind mitigation inspection is what earns the storm-resistance discounts on top of that. Both are performed by a licensed home inspector, and both are needed again each time you move to a new carrier, which is why many Florida homeowners hire an inspector every few years without ever buying or selling a house.',
  },
  {
    question: 'What is a 4-point inspection?',
    answer:
      "A 4-point inspection is a focused review of a home's four highest-risk systems for an insurer: roof, electrical, plumbing, and HVAC. Most Florida carriers require one for homes past a certain age, commonly 25 to 30 years, though the exact cutoff varies by insurer, before writing or renewing a policy.",
  },
  {
    question: 'What is a wind mitigation inspection, and does it actually lower my premium?',
    answer:
      'A wind mitigation inspection documents storm-resistant features of a home, such as roof shape, roof-to-wall attachment, and opening protection, that many Florida insurers use to apply premium discounts. It does not guarantee a lower rate, but it is the only way to get credit for those features if the home has them.',
  },
  {
    question:
      'Do I need a wind mitigation or 4-point inspection if I already own my home, not just when buying one?',
    answer:
      'Yes. Insurers frequently request an updated 4-point or wind mitigation inspection at policy renewal, especially after a carrier change or policy review, not only at the time of purchase. This is just as common a reason to search for a licensed inspector as a new home purchase.',
  },
  {
    question: 'How long is a wind mitigation inspection good for?',
    answer:
      'There is no single statewide rule and it depends on the carrier, but many Florida insurers treat a wind mitigation report as valid for around five years. Some ask for a newer one sooner, so confirm with your agent before assuming an older report still applies.',
  },
  {
    question: 'How long is a 4-point inspection good for?',
    answer:
      'Usually far less time than a wind mitigation report. Carriers commonly want a 4-point completed within the last year, and some want one more recent than that, so moving to a new carrier generally means paying for a fresh inspection rather than reusing an old report. That is the main reason a homeowner who shops for a better rate every few years ends up hiring an inspector again each time, and it is worth asking your agent what that specific carrier will accept before you book.',
  },
  {
    question: 'How do I know a home inspector is actually licensed in Florida?',
    answer:
      "Licensed Florida home inspectors are registered with the Department of Business and Professional Regulation (DBPR) and issued a license number. Homeowners can verify any inspector's license number directly with the DBPR before booking an inspection.",
  },
];
