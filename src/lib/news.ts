// News and press coverage supplied by the YEGO secretariat.
// Only this page (and the homepage preview) should change when news is updated.
export type NewsTag = 'Partnership' | 'Announcement' | 'Press release' | 'Media' | 'Statement'

export interface NewsLink {
  label: string
  url: string
}

export interface NewsItem {
  id: string
  date?: string
  tag: NewsTag
  title: string
  excerpt: string
  source?: string
  links?: NewsLink[]
}

export const NEWS: NewsItem[] = [
  {
    id: 'police-partnership',
    date: '2026-09-18',
    tag: 'Partnership',
    title: 'Nigeria Police assure partnership with YEGO ahead of 2027 elections',
    excerpt:
      'The Nigeria Police Force has assured the Youth Electoral Guards Observers of its partnership and support as the initiative prepares for the 2027 general elections, reinforcing collaboration on peaceful participation and electoral security.',
    source: 'Nigeria Youths in Politics',
    links: [
      {
        label: 'Nigeria Youths in Politics',
        url: 'https://nigeriayouthsinpolitics.org/nigeria-police-assures-partnership-with-youth-electoral-guards-observer-yego-ahead-of-2027-elections/',
      },
      {
        label: 'Bisra Communications',
        url: 'https://bisracommunications.com/2026/09/18/police-assure-partnership-with-yego-ahead-of-2027-elections/',
      },
      {
        label: 'Prime News 360',
        url: 'https://primenews360.com/2026/09/18/police-assure-of-partnership-with-youth-electoral-guards-towards-2027-elections/',
      },
    ],
  },
  {
    id: '300000-guards',
    date: '2026-08-19',
    tag: 'Announcement',
    title: '300,000 young Nigerians to guard the integrity of the 2027 elections',
    excerpt:
      'Nigeria Youths in Politics is mobilising over 300,000 young Nigerians under YEGO to promote electoral integrity, vigilance, peaceful participation and responsible incident reporting ahead of the 2027 general elections, moving young people from passive voters to active guardians of democracy.',
    source: 'News Agency of Nigeria',
    links: [
      {
        label: 'News Agency of Nigeria (NAN)',
        url: 'https://nannews.ng/2027-group-to-train-300000-youths-on-electoral-integrity-vigilance-youth/',
      },
      { label: 'Prime RiseNews', url: 'https://primerisenews.com/?p=686' },
      { label: 'Daily Legend', url: 'https://dailylegendng.com/2026/08/19/youth/' },
      {
        label: 'Prime News 360',
        url: 'https://primenews360.com/2026/08/19/youth-group-unveils-plan-for-50000-observers-for-2027-polls/',
      },
      {
        label: 'Bisra Communications',
        url: 'https://bisracommunications.com/2026/08/19/youth-electoral-guards-launch-plan-to-recruit-300000-for-2027-polls-after-osun-lessons/',
      },
      {
        label: 'Nigeria Youths in Politics',
        url: 'https://nigeriayouthsinpolitics.org/youth-electoral-guards-the-guardrails-of-nigerias-electoral-integrity-lessons-from-osun-fct-abuja-17th-august-2026/',
      },
      {
        label: 'Capital Times',
        url: 'https://capitaltimesnews.com/youth-electoral-guards-the-guardrails-of-nigerias-electoral-integrity-lessons-from-osun/',
      },
      {
        label: 'Full publication report (PDF)',
        url: 'https://nigeriayouthsinpolitics.org/wp-content/uploads/2026/08/YOUTH-ELECTORAL-GUARDS-THE-GUARDRAILS-OF-NIGERIAS-ELECTORAL-INTEGRITY.pdf',
      },
    ],
  },
  {
    id: 'guardrails-osun',
    date: '2026-08-17',
    tag: 'Press release',
    title: 'Youth Electoral Guards: the guardrails of Nigeria’s electoral integrity, lessons from Osun',
    excerpt:
      'Ahead of 2027, YEGO is building a nationwide framework to recruit, train and deploy 50,000 young Nigerians as electoral master trainers and frontline civic actors, with a wider network reaching over 170,000 polling units. The Osun election provided practical lessons for responsible citizen observation.',
    source: 'FCT-Abuja · 17 August 2026',
    links: [
      {
        label: 'Read the full press release (PDF)',
        url: 'https://nigeriayouthsinpolitics.org/wp-content/uploads/2026/08/YOUTH-ELECTORAL-GUARDS-THE-GUARDRAILS-OF-NIGERIAS-ELECTORAL-INTEGRITY.pdf',
      },
    ],
  },
  {
    id: 'inec-100-days',
    date: '2026-10-09',
    tag: 'Press release',
    title: 'YEGO commends INEC’s 100-day readiness, unveils early-warning and rapid response mechanism',
    excerpt:
      'YEGO commended the Independent National Electoral Commission on its 100-day readiness for the 2027 elections and unveiled the Early-Warning and Rapid Response Mechanism (ERARM), the verification and escalation layer behind the ERART reporting dashboard.',
    source: 'Capital Times · Bisra Communications',
    links: [
      {
        label: 'Capital Times',
        url: 'https://capitaltimesnews.com/yego-commends-inecs-100-day-to-elections-readiness-unveils-early-warning-and-rapid-response-mechanism/',
      },
      {
        label: 'Bisra Communications',
        url: 'https://bisracommunications.com/2026/10/09/yego-commends-inecs-100-day-to-elections-readiness-unveils-early-warning-and-rapid-response-mechanism/',
      },
    ],
  },
  {
    id: 'peace-corps',
    date: '2026-09-10',
    tag: 'Partnership',
    title: 'Peace Corps of Nigeria pledges nationwide support for YEGO 2027',
    excerpt:
      'The Peace Corps of Nigeria pledged nationwide support for YEGO during a collaboration visit on 10 September 2026, offering its personnel and structures to support grassroots coordination, deployment and electoral peacebuilding.',
    source: 'YEGO press release',
  },
  {
    id: 'press-conference',
    date: '2026-10-06',
    tag: 'Media',
    title: 'YEGO team at INEC’s 100 days to 2027 election world press conference',
    excerpt:
      'The YEGO team joined the world press conference organised by INEC in Abuja on 6 October 2026, marking 100 days to the 2027 general elections and reinforcing the initiative’s commitment to credible, peaceful elections.',
    source: 'Abuja · 6 October 2026',
  },
  {
    id: 'democracy-blocked',
    tag: 'Statement',
    title: 'Democracy must not be blocked',
    excerpt:
      'YEGO condemned the reported blockade of a presidential candidate’s convoy along the Gboko Road/Makurdi axis of Benue State and called for peaceful campaigns, restraint and protection of Nigeria’s democratic space. No candidate should be blocked from campaigning peacefully; no young Nigerian should be recruited into political violence.',
    source: 'YEGO statement',
  },
  {
    id: 'man-o-war',
    tag: 'Partnership',
    title: 'Man O’War Nigeria pledges nationwide support for YEGO 2027',
    excerpt:
      'Man O’War Nigeria committed to collaborating with YEGO on electoral security synergies, peaceful participation and violence prevention, offering its nationwide network and disciplined personnel to support grassroots mobilisation and volunteer coordination.',
    source: 'YEGO press release',
  },
  {
    id: 'dss-visit',
    tag: 'Partnership',
    title: 'YEGO engagement visit to the DG DSS: technical support for training 50,000 Guards',
    excerpt:
      'The Department of State Services reaffirmed support for YEGO, offering experienced resource persons for training and its state and local government offices for grassroots engagement, alongside a structured information-sharing mechanism for credible, verified reports.',
    source: 'YEGO press release',
  },
]

export const NEWS_TAGS: NewsTag[] = ['Partnership', 'Press release', 'Announcement', 'Media', 'Statement']
