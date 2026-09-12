export interface FaqSource {
  label: string;
  url: string;
}

export interface FaqItem {
  question: string;
  answer: string;
  /**
   * Shown under the answer as a link the reader can follow. Only a statute, a
   * regulator, or a licensing authority belongs here — not an insurance blog.
   * An answer with no entry here is making no claim that needs one.
   */
  sources?: FaqSource[];
}

// IMPORTANT: this is the ONLY place FAQ copy lives. The visible accordion
// and the FAQPage JSON-LD schema both render from this array. Editing the
// text here updates both automatically — never hardcode FAQ copy directly
// into a page or into a separate schema block, or the two will drift and
// undermine the whole point of having structured data for AI answer engines.
//
// Every claim in here was gone through on 2026-09-11 and either given a source
// a reader can check or removed. What came out, and why:
//
//   - "that carrier will almost always require a current 4-point" — untrue of
//     a newer house, where no 4-point is asked for at all.
//   - "both are needed again each time you move to a new carrier" — untrue of
//     a wind mitigation, which OIR treats as valid for up to five years, and
//     it contradicted another answer in this same list.
//   - "commonly 25 to 30 years" — a number with no source behind it, which
//     also disagreed with the insurance page on the same site.
//   - "the insurance premium becomes part of the monthly payment your lender
//     uses to decide how much you can borrow" — a claim about mortgage
//     underwriting on a home inspection directory, from a blog.
//   - "the main reason a homeowner who shops for a better rate ends up hiring
//     an inspector again each time" — an assertion about why people do things
//     that nobody measured.
//
// No insurer is named anywhere in here. A directory that lists every licensed
// inspector in a county has no business singling one out.
export const faqItems: FaqItem[] = [
  {
    question:
      'My home insurance went up. Can I get a cheaper rate, and what inspections would I need?',
    answer:
      'Often you can, and it is worth asking. Call your agent and ask them to shop other carriers for the same house, and the carrier that quotes you will say what it needs. On an older house that commonly means a 4-point inspection. A wind mitigation is separate: it records the storm-resistance features your premium can be credited for. Both are performed by a licensed Florida home inspector. A 4-point generally has to be recent, so changing carrier often means a new one, while a wind mitigation form can be reused for up to five years.',
    sources: [
      { label: 'Fla. Stat. § 627.0629', url: 'https://flsenate.gov/Laws/Statutes/2025/627.0629' },
      { label: 'Florida OIR, wind mitigation', url: 'https://floir.gov/consumers/wind-mitigation-resources' },
    ],
  },
  {
    question: 'What is a 4-point inspection?',
    answer:
      "A 4-point inspection is a focused review of the four systems an insurer treats as highest risk: roof, electrical, plumbing, and HVAC. Carriers ask for one on older houses and each sets its own age threshold, so the same house can need one at one company and not at another. It decides whether a policy gets written at all rather than what it costs.",
  },
  {
    question: 'What is a wind mitigation inspection, and does it actually lower my premium?',
    answer:
      'A wind mitigation inspection records storm-resistance features such as roof shape, roof-to-wall attachment, and opening protection. Florida law requires a residential property rate filing to include credits for verified features of that kind, so the report is how a house gets credited for having them. It does not guarantee a lower rate, because the size of any credit is set in each carrier’s own filing, but without the report there is nothing on file showing the house qualifies.',
    sources: [
      { label: 'Fla. Stat. § 627.0629', url: 'https://flsenate.gov/Laws/Statutes/2025/627.0629' },
    ],
  },
  {
    question: 'My roof is more than 15 years old. Can an insurer refuse to cover the house?',
    answer:
      'Not on age alone, provided the roof passes an inspection. Florida law, section 627.7011, says an insurer may not refuse to write or renew a policy solely because of the age of a roof that is less than 15 years old. Once a roof reaches 15 years, the insurer must allow you to pay for a roof inspection before it can require a replacement as a condition of coverage, and if that inspection finds the roof has five or more years of useful life remaining, the insurer may not refuse to write or renew the policy solely because of the roof age. Subsection (5)(a) names a home inspector licensed under section 468.8314 as one of the professionals who may perform it.',
    sources: [
      { label: 'Fla. Stat. § 627.7011', url: 'https://flsenate.gov/Laws/Statutes/2025/627.7011' },
    ],
  },
  {
    question:
      'Do I need a wind mitigation or 4-point inspection if I already own my home, not just when buying one?',
    answer:
      'Yes. These are not only purchase-time inspections. Changing carrier is the common trigger, and an insurer may also ask for an updated report at renewal or after a policy review. It is why a homeowner who has not bought or sold a house in years can still end up needing an inspector.',
  },
  {
    question: 'How long is a wind mitigation inspection good for?',
    answer:
      'The Florida Office of Insurance Regulation states that a completed uniform mitigation verification form is valid for up to five years, provided nothing material about the structure has changed and nothing on the form turns out to be inaccurate. A carrier can still ask for a newer one, so confirm with your agent before assuming an older report still applies.',
    sources: [
      { label: 'Florida OIR, wind mitigation', url: 'https://floir.gov/consumers/wind-mitigation-resources' },
    ],
  },
  {
    question: 'How long is a 4-point inspection good for?',
    answer:
      'Much less time than a wind mitigation report. Carriers commonly want one completed within the last year, and some want it more recent than that, so moving to a new carrier often means paying for a fresh inspection rather than reusing an old one. This one varies by company more than most, so ask your agent what that specific carrier will accept before you book.',
  },
  {
    question: 'How do I know a home inspector is actually licensed in Florida?',
    answer:
      'Florida home inspectors are licensed by the Department of Business and Professional Regulation and issued a license number. You can check any inspector yourself in the DBPR licensing portal, by name or by license number, before booking anything. Every listing in this directory is built from that same record.',
    sources: [
      { label: 'DBPR, verify a licensee', url: 'https://www.myfloridalicense.com/wl11.asp?mode=0' },
    ],
  },
];
