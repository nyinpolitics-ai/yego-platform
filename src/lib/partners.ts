// Strategic partners as listed in the YEGO partnership brief (October 2026).
// Partner marks are reproduced from that brief. Names, descriptions and marks
// should be confirmed with each organisation before public launch.
export type PartnerCategory =
  | 'Security & public safety'
  | 'Peace & civic service'
  | 'Youth political participation'
  | 'Youth network'

export interface Partner {
  id: string
  name: string
  category: PartnerCategory
  summary: string
  logo: string
  website?: string
}

export const PARTNERS: Partner[] = [
  {
    id: 'nigeria-police',
    name: 'Nigeria Police Force',
    category: 'Security & public safety',
    summary: 'Election security, public order and protection of voters and officials.',
    logo: '/img/partners/nigeria-police.png',
  },
  {
    id: 'man-o-war',
    name: "Man O' War Nigeria",
    category: 'Security & public safety',
    summary: 'Volunteer corps, crowd management and community mobilisation.',
    logo: '/img/partners/man-o-war.png',
  },
  {
    id: 'peace-corps',
    name: 'Peace Corps of Nigeria',
    category: 'Peace & civic service',
    summary: 'Peacebuilding, civic service and community-based conflict prevention.',
    logo: '/img/partners/peace-corps.png',
  },
  {
    id: 'nigeria-youths-in-politics',
    name: 'Nigeria Youths in Politics',
    category: 'Youth political participation',
    summary: 'Youth political participation, civic education and leadership.',
    logo: '/img/partners/nigeria-youths-in-politics.png',
  },
  {
    id: 'northern-youth-council',
    name: 'Northern Youth Council of Nigeria',
    category: 'Youth network',
    summary: 'Northern youth network coordinating civic and community programmes.',
    logo: '/img/partners/northern-youth-council.png',
  },
  {
    id: 'national-youth-assembly',
    name: 'National Youth Assembly of Nigeria',
    category: 'Youth network',
    summary: 'National youth assembly connecting young people across states.',
    logo: '/img/partners/national-youth-assembly.png',
  },
  {
    id: 'ijaw-youth-council',
    name: 'Ijaw Youth Council',
    category: 'Youth network',
    summary: 'Niger Delta youth network for peace, participation and accountability.',
    logo: '/img/partners/ijaw-youth-council.png',
  },
  {
    id: 'yoruba-youth-council',
    name: 'Yoruba Youth Council',
    category: 'Youth network',
    summary: 'South-West youth network mobilising for peaceful participation.',
    logo: '/img/partners/yoruba-youth-council.png',
  },
  {
    id: 'ohanaeze-youth-council',
    name: 'Ohanaeze Youth Council',
    category: 'Youth network',
    summary: 'South-East youth network supporting civic engagement and observation.',
    logo: '/img/partners/ohanaeze-youth-council.png',
  },
  {
    id: 'igbo-national-council',
    name: 'Igbo National Council',
    category: 'Youth network',
    summary: 'National sociocultural council mobilising communities for equity, civic inclusion and peaceful participation.',
    logo: '/img/partners/igbo-national-council.png',
  },
  {
    id: 'arewa-youth-council',
    name: 'Arewa Youth Council',
    category: 'Youth network',
    summary: 'Northern youth council promoting unity, education and civic participation: we set the pace.',
    logo: '/img/partners/arewa-youth-council.png',
  },
  {
    id: 'female-youths',
    name: 'Female Youths',
    category: 'Youth network',
    summary: 'Movement mobilising young Nigerian women for leadership, mentorship and electoral participation.',
    logo: '/img/partners/female-youths.png',
  },
  {
    id: 'bisigi-africa',
    name: 'BISIGI AFRICA',
    category: 'Peace & civic service',
    summary: 'Inclusion-focused civic organisation working towards an inclusive future for communities across Africa.',
    logo: '/img/partners/bisigi-africa.png',
  },
  {
    id: 'consent-africa',
    name: 'CONSENT Africa',
    category: 'Youth political participation',
    summary: 'Young Constituents for Development Initiative advancing youth development and democratic accountability.',
    logo: '/img/partners/consent-africa.png',
  },
  {
    id: 'vmcii',
    name: 'Votes Must Count International Initiative (VMCII)',
    category: 'Youth political participation',
    summary: 'International initiative defending electoral integrity so that every vote counts and the right to choose is protected.',
    logo: '/img/partners/vmcii.png',
  },
  {
    id: 'ridli',
    name: 'Rural Innovations and Digital Literacy Development (RIDLI)',
    category: 'Peace & civic service',
    summary: 'Bringing rural innovation and digital literacy development to communities nationwide.',
    logo: '/img/partners/ridli.png',
    website: 'https://ridli.org',
  },
]

export const PARTNER_CONTACTS = [
  { label: 'NYPD-Advocacy', value: 'nypdadvocacy@gmail.com', href: 'mailto:nypdadvocacy@gmail.com' },
  { label: 'NYPD-Advocacy phone (WhatsApp only)', value: '+234 815 703 1718', href: 'https://wa.me/2348157031718' },
  { label: 'YEGO', value: 'youthelectoralguards@gmail.com', href: 'mailto:youthelectoralguards@gmail.com' },
]

export const PARTNER_CATEGORIES: PartnerCategory[] = [
  'Security & public safety',
  'Peace & civic service',
  'Youth political participation',
  'Youth network',
]
