/*
Purpose: Every resource on the Resources page, one record each. A record holds everything the page shows about it.

Expected Response Information:
- resources: a list of { rName, rDescription, rLink, rImage, rImageInset?, type, tags, offers?, summary }.
  - type: who runs it, one of resourceTypes in resourceTaxonomy.
  - tags: the record's other filter tags, each spelled as in resourceTaxonomy.
  - summary: one to three short bullets for the card, restating rDescription.
  - offers (clubs only, optional): what the club offers, from offerings in resourceTaxonomy, taken from the club's
    own site or posts.
*/
import uw_logo from "../logos/uw-logo.png";
import ischool_logo from "../logos/ischool-logo.png";
import canvas_logo from "../logos/canvas-logo.png";
import iqueeries_logo from "../logos/iqueeries-logo.png";
import winfo_logo from "../logos/winfo-logo.jpeg";
import binfo_logo from "../logos/binfo-logo.png";
import isaca_logo from "../logos/isaca-logo.png";
import imuslims_logo from "../logos/imuslims.webp";
import aws_student_builder_group_logo from "../logos/aws-student-builder-group.jpg";
import claude_builder_club_logo from "../logos/claude-builder-club-uw.jpg";
import comet_logo from "../logos/comet-uw.jpg";
import cseed_logo from "../logos/cseed.jpg";
import dubhacks_logo from "../logos/dubhacks.jpg";
import dubhacksnext_logo from "../logos/dubhacksnext.jpg";
import dubstech_logo from "../logos/dubstech.jpg";
import figma_uw_logo from "../logos/figma-uw.jpg";
import husky_coding_project_logo from "../logos/husky-coding-project.png";
import tca_logo from "../logos/tca.jpg";
import ux_uw_logo from "../logos/ux-uw.jpg";
import product_space_logo from "../logos/product-space-logo-trimmed.webp";
import ijournal_logo from "../logos/ijournal.webp";
import pm_club_logo from "../logos/pm-club.webp";
import montlake_consulting_group_logo from "../logos/montlake-consulting-group.webp";
import uw_consulting_association_logo from "../logos/uw-consulting-association.webp";
import business_impact_group_logo from "../logos/business-impact-group.webp";
import information_consulting_group_logo from "../logos/information-consulting-group.webp";
import istartup_lab_logo from "../logos/istartup-lab.webp";
import swe_uw_logo from "../logos/swe-uw.webp";
import swecc_logo from "../logos/swecc.webp";
import web_impact_logo from "../logos/web-impact.webp";
import data_science_society_logo from "../logos/data-science-society.webp";
import interactive_intelligence_logo from "../logos/interactive-intelligence.webp";
import women_in_ux_logo from "../logos/women-in-ux.webp";
import ux_health_logo from "../logos/ux-health.webp";
import thinkcyber_logo from "../logos/thinkcyber.webp";
import batmans_kitchen_logo from "../logos/batmans-kitchen.webp";
import wicys_uw_logo from "../logos/wicys-uw.webp";

export const resources = [
  {
    "rName": "iSchool Student Services",
    "rDescription": "iSchool staff are here to help provide you with quality support throughout your iSchool experience as you explore, develop and pursue opportunities that align with your life and career goals. Advising hours and scheduling instructions are listed below for graduate admissions, academic and career advisors. Most programs host appointments online or in-person.",
    "rLink": "https://ischool.uw.edu/advising-support",
    "rImage": ischool_logo,
    "type": "iSchool",
    "tags": ["Academic"],
    "summary": [
      "iSchool staff support you as you explore, develop, and pursue opportunities that align with your life and career goals",
      "Graduate admissions, academic, and career advisors, with advising hours and scheduling instructions",
      "Most programs host appointments online or in person",
    ],
  },
  {
    "rName": "iSchool Peer Advisors",
    "rDescription": "The Informatics Peer Advisor team meets with current INFO students and current UW students who are considering applying to the Informatics major.",
    "rLink": "https://ischool.uw.edu/advising-support/peer-advisors",
    "rImage": ischool_logo,
    "type": "iSchool",
    "tags": ["Academic"],
    "summary": [
      "The Informatics Peer Advisor team meets with current INFO students",
      "Also meets with current UW students who are considering applying to the Informatics major",
    ],
  },
  {
    "rName": "UW CLUE Program",
    "rDescription": "CLUE is an academic support/tutoring program designed to help students succeed in their coursework at UW.",
    "rLink": "https://academicsupport.uw.edu/clue/",
    "rImage": uw_logo,
    "type": "UW",
    "tags": ["Academic"],
    "summary": [
      "Academic support and tutoring program",
      "Designed to help students succeed in their UW coursework",
    ],
  },
  {
    "rName": "iSchool Career Services (Canvas)",
    "rDescription": "The iSchool Career Services team is excited to help support you in meeting your professional development goals and navigating the job search process. Our team provides one-on-one advising, help with job search strategies and specific opportunities, resume and cover letter feedback, and interview advice and practice.",
    "rLink": "https://canvas.uw.edu/courses/1614908",
    "rImage": canvas_logo,
    "type": "iSchool",
    "tags": ["Jobs & internships"],
    "summary": [
      "One-on-one advising for professional development goals and the job search",
      "Help with job search strategies and specific opportunities",
      "Resume and cover letter feedback, plus interview advice and practice",
    ],
  },
  {
    "rName": "iMentorship",
    "rDescription": "The mission of the iMentorship Program is to support students in the iSchool’s Bachelor of Science in Informatics and Master of Science in Information Management (MSIM) programs as they pursue their professional dreams by enabling each student to work closely, one-on-one, with an information professional who can provide insight, guidance and support, and can help the student jumpstart a professional network.",
    "rLink": "https://ischool.uw.edu/alumni/get-involved/imentorship",
    "rImage": ischool_logo,
    "type": "iSchool",
    "tags": ["Jobs & internships"],
    "summary": [
      "Work closely, one-on-one, with an information professional as you pursue your professional dreams",
      "They can provide insight, guidance, and support, and help you jumpstart a professional network",
      "For students in the BS in Informatics and Master of Science in Information Management (MSIM) programs",
    ],
  },
  {
    "rName": "Curricular Practical Training for F-1 Students",
    "rDescription": "Curricular Practical Training (CPT) is an opportunity for students on F-1 visas to learn practical skills related to their majors while studying at the University of Washington. CPT serves as a work authorization as students engage in different types of activities related to their major.",
    "rLink": "https://iss.washington.edu/f1-employment/off-campus-employment-f1/cpt/",
    "rImage": uw_logo,
    "type": "UW",
    "tags": ["Jobs & internships"],
    "summary": [
      "Serves as work authorization for students on F-1 visas while studying at UW",
      "Learn practical skills related to your major through different types of activities",
    ],
  },
  {
    "rName": "Post Completion OPT for F-1 Students",
    "rDescription": "A Post-Completion OPT (Optional Practical Training) is a temporary work authorization provided to international students on F-1 visas in the United States.",
    "rLink": "https://iss.washington.edu/f1-employment/post-completion/",
    "rImage": uw_logo,
    "type": "UW",
    "tags": ["Jobs & internships"],
    "summary": [
      "Temporary work authorization in the United States",
      "For international students on F-1 visas",
    ],
  },
  {
    "rName": "On-campus Employment for F-1 Students",
    "rDescription": "On-campus employment is a work option available to F-1 international students in the United States, allowing them to maintain their visa status while earning money and gaining work experience.",
    "rLink": "https://iss.washington.edu/f1-employment/on-campus/",
    "rImage": uw_logo,
    "type": "UW",
    "tags": ["Jobs & internships"],
    "summary": [
      "On-campus work option for F-1 international students",
      "Earn money and gain work experience while maintaining your visa status",
    ],
  },
  {
    "rName": "Husky Health & Well-Being",
    "rDescription": "UW Seattle offers a wide range of health and wellness services, from exceptional medical care and counseling services to recreation classes, safety resources, peer health advocacy, trainings and more. Most services on this site are limited to currently enrolled UW Seattle students, while others are open to faculty, staff and the general public.",
    "rLink": "https://wellbeing.uw.edu/",
    "rImage": uw_logo,
    "type": "UW",
    "tags": ["Mental Health"],
    "summary": [
      "A wide range of health and wellness services at UW Seattle, including medical care and counseling",
      "Recreation classes, safety resources, peer health advocacy, trainings, and more",
      "Most services are limited to currently enrolled UW Seattle students, and some are open to faculty, staff, and the general public",
    ],
  },
  {
    "rName": "Leigh Eisele, LMHC, LCPC, NCC",
    "rDescription": "Clinical Mental Health Therapist and Liaison to the College of Built Environments and iSchool.",
    "rLink": "https://wellbeing.uw.edu/staff/leigh-eisele-lmhc-lcpc-ncc/",
    "rImage": uw_logo,
    "type": "UW",
    "tags": ["Mental Health"],
    "summary": [
      "Clinical mental health therapist",
      "Liaison to the College of Built Environments and the iSchool",
    ],
  },
  {
    "rName": "iSchool Office of IDEAS",
    "rDescription": "At the iSchool, inclusion and connectedness are celebrated as essential components of academic excellence.",
    "rLink": "https://ischool.uw.edu/diversity",
    "rImage": ischool_logo,
    "type": "iSchool",
    "tags": ["DEI"],
    "summary": [
      "Celebrates inclusion and connectedness at the iSchool as essential to academic excellence",
    ],
  },
  {
    "rName": "Diversity @ UW",
    "rDescription": "At the University of Washington, diversity, equity, inclusion and belonging are integral to excellence. We value and honor diverse identities, experiences, and perspectives, strive to create accessible, welcoming, and respectful learning environments, and promote access, opportunity, and justice for all.",
    "rLink": "https://www.washington.edu/diversity/",
    "rImage": uw_logo,
    "type": "UW",
    "tags": ["DEI"],
    "summary": [
      "Diversity, equity, inclusion, and belonging as integral to excellence at UW",
      "Values and honors diverse identities, experiences, and perspectives",
      "Strives to create accessible, welcoming, and respectful learning environments and promotes access, opportunity, and justice for all",
    ],
  },
  {
    "rName": "Black in Informatics (Binfo)",
    "rDescription": "Black in Informatics is a community-driven organization dedicated to fostering the professional, academic, and personal development of Black students within the Informatics program. Its mission is to amplify the presence and successes of Black students in Informatics, guiding them throughout their journey at UW with resources, mentorship, and specialized learning experiences.",
    "rLink": "https://linktr.ee/binfouw",
    "rImage": binfo_logo,
    "type": "Student clubs",
    "tags": ["iOrgs", "DEI"],
    "summary": [
      "Community-driven organization fostering the professional, academic, and personal development of Black students in Informatics",
      "Its mission is to amplify the presence and successes of Black students in Informatics",
      "Guides students through their UW journey with resources, mentorship, and specialized learning experiences",
    ],
  },
  {
    "rName": "iMuslims",
    "rDescription": "iMuslims is a student-led organization dedicated to providing Muslim students at the iSchool with resources and community that will allow them to thrive at UW and beyond. We empower students to be information and technology leaders by promoting connection, establishing networks, and building professional skills through event programming. All students are welcome at our events — you can keep up with our org by following us on Instagram @imuslims.uw.",
    "rLink": "https://www.instagram.com/imuslims.uw/",
    "rImage": imuslims_logo,
    "type": "Student clubs",
    "tags": ["iOrgs", "DEI"],
    "summary": [
      "Student-led resources and community to help Muslim students at the iSchool thrive at UW and beyond",
      "Empowers students to be information and technology leaders through events that promote connection, establish networks, and build professional skills",
      "All students are welcome at events, and you can keep up with the org on Instagram @imuslims.uw",
    ],
  },
  {
    "rName": "iQueeries",
    "rDescription": "iQueeries provides a safe, positive, and nurturing space for LGBTQIA+ and supportive ally students in the Information School. It works to foster a strong, supportive queer community within the iSchool as well as UW at large, and to promote positive change and social justice within the field of information sciences. iQueeries is intersectional: all identities and experiences are welcome and encouraged to share their voices.",
    "rLink": "https://depts.washington.edu/ischoolq/",
    "rImage": iqueeries_logo,
    "type": "Student clubs",
    "tags": ["iOrgs", "DEI"],
    "summary": [
      "Safe, positive, and nurturing space for LGBTQIA+ and supportive ally students in the iSchool",
      "Fosters a strong, supportive queer community in the iSchool and UW at large, and promotes positive change and social justice in the information sciences",
      "iQueeries is intersectional, and all identities and experiences are welcome and encouraged to share their voices",
    ],
  },
  {
    "rName": "ISACA",
    "rDescription": "ISACA aims to engage students who are interested in learning about information security and risk. This student group accomplishes this by hosting workshops and events that teach students about basic information security procedures and best practices.",
    "rLink": "https://www.instagram.com/isacauw/",
    "rImage": isaca_logo,
    "type": "Student clubs",
    "tags": ["Cybersecurity"],
    "summary": [
      "For students interested in learning about information security and risk",
      "Workshops and events on basic information security procedures and best practices",
    ],
  },
  {
    "rName": "Women in Informatics (Winfo)",
    "rDescription": "Women in Informatics supports ways to empower women to thrive as producers of technology. Winfo is a supportive network of women in technology fields who provide students with mentorship, resources and support toward career development and academic pursuits.",
    "rLink": "https://ischool.uw.edu/diversity/resources/student-groups/winfo",
    "rImage": winfo_logo,
    "type": "Student clubs",
    "tags": ["iOrgs", "DEI"],
    "offers": ["Hackathon", "Career panels"],
    "summary": [
      "Empowers women to thrive as producers of technology",
      "Supportive network of women in technology fields",
      "Mentorship, resources, and support for career development and academic pursuits",
    ],
  },
  {
    "rName": "DubHacks",
    "rDescription": "Student built. Community-driven. Future-focused. DubHacks is a tech and entrepreneurship non-profit in Seattle run by students at the University of Washington. We bring together students of all backgrounds to tackle the issues they are most passionate about.",
    "rLink": "https://dubhacks.co/",
    "rImage": dubhacks_logo,
    "type": "Student clubs",
    "tags": ["Entrepreneurship"],
    "offers": ["Hackathon"],
    "summary": [
      "Student built, community-driven, and future-focused",
      "Tech and entrepreneurship nonprofit in Seattle run by UW students",
      "Brings together students of all backgrounds to tackle the issues they're most passionate about",
    ],
  },
  {
    "rName": "DubHacksNext",
    "rDescription": "Building Tomorrow's Founders. A 16-week program transforming exceptional UW students into funded startup founders through intensive mentorship, resources, and community at UW's Top Startup Incubator.",
    "rLink": "https://next.dubhacks.co/",
    "rImage": dubhacksnext_logo,
    "type": "Student clubs",
    "tags": ["Entrepreneurship"],
    "offers": ["Project teams"],
    "summary": [
      "Building tomorrow's founders",
      "16-week program turning exceptional UW students into funded startup founders",
      "Intensive mentorship, resources, and community at UW's top startup incubator",
    ],
  },
  {
    "rName": "Claude Builder Club @ UW",
    "rDescription": "Learn and build with AI. Backed by Claude.",
    "rLink": "https://linktr.ee/claudeatuofwa?utm_source=ig&utm_medium=social&utm_content=link_in_bio",
    "rImage": claude_builder_club_logo,
    "type": "Student clubs",
    "tags": ["DS/ML"],
    "offers": ["Hackathon"],
    "summary": [
      "Learn and build with AI",
      "Backed by Claude",
    ],
  },
  {
    "rName": "UX @ UW Club",
    "rDescription": "A community for students of all levels who want to grow their UX skills.",
    "rLink": "https://uxuw.framer.website/?utm_source=ig&utm_medium=social&utm_content=link_in_bio",
    "rImage": ux_uw_logo,
    "type": "Student clubs",
    "tags": ["UI/UX"],
    "summary": [
      "Community for students who want to grow their UX skills",
      "Open to students of all levels",
    ],
  },
  {
    "rName": "AWS Student Builder Group @ UW",
    "rDescription": "Helping Huskies explore, build & connect through cloud tech ☁️ Powered by AWS.",
    "rLink": "https://bio.site/awssbguw?utm_source=ig&utm_medium=social&utm_content=link_in_bio",
    "rImage": aws_student_builder_group_logo,
    "type": "Student clubs",
    "tags": ["Software Engineering"],
    "summary": [
      "Helping Huskies explore, build, and connect through cloud tech",
      "Powered by AWS",
    ],
  },
  {
    "rName": "Product Space @ UW",
    "rDescription": "Cultivating tomorrow’s product leaders. Join a nationwide family of students in product today 💜",
    "rLink": "https://linktr.ee/uwproductspace_?utm_source=ig&utm_medium=social&utm_content=link_in_bio",
    "rImage": product_space_logo,
    "rImageInset": true,
    "type": "Student clubs",
    "tags": ["PM/Consulting"],
    "offers": ["Project teams", "Competition"],
    "summary": [
      "Cultivating tomorrow's product leaders",
      "Part of a nationwide family of students in product",
    ],
  },
  {
    "rName": "Figma @ UW",
    "rDescription": "Making design accessible for everyone ✨ Bringing Figma closer to UW 🐾💜",
    "rLink": "https://www.instagram.com/figmaatuw/",
    "rImage": figma_uw_logo,
    "type": "Student clubs",
    "tags": ["UI/UX"],
    "summary": [
      "Making design accessible for everyone",
      "Bringing Figma closer to UW",
    ],
  },
  {
    "rName": "Comet @ UW",
    "rDescription": "Browse at the speed of thought 🪐 Managed by Perplexity Campus Ambassadors :)",
    "rLink": "https://www.instagram.com/uwcomet/",
    "rImage": comet_logo,
    "type": "Student clubs",
    "tags": ["DS/ML"],
    "summary": [
      "Browse at the speed of thought",
      "Managed by Perplexity Campus Ambassadors",
    ],
  },
  {
    "rName": "DubsTech",
    "rDescription": "UW's largest tech community. We host workshops, hackathons, and talks on design, data science, and software engineering.",
    "rLink": "https://linktr.ee/dubstech?utm_source=ig&utm_medium=social&utm_content=link_in_bio",
    "rImage": dubstech_logo,
    "type": "Student clubs",
    "tags": ["DS/ML"],
    "offers": ["Hackathon"],
    "summary": [
      "UW's largest tech community",
      "Hosts workshops, hackathons, and talks",
      "Covers design, data science, and software engineering",
    ],
  },
  {
    "rName": "CSeed",
    "rDescription": "Inspiring engineering & design students at UW to build what they care about!",
    "rLink": "https://www.cseed.co/cseed-teams",
    "rImage": cseed_logo,
    "type": "Student clubs",
    "tags": ["Entrepreneurship"],
    "offers": ["Project teams"],
    "summary": [
      "Inspiring engineering and design students at UW to build what they care about",
    ],
  },
  {
    "rName": "Husky Coding Project",
    "rDescription": "Your launchpad for tech teamwork @ the UW. Husky Coding Project is a student organization at University of Washington that aims to provide a space for students, regardless of major or background, to gain group project work experience within the tech field.",
    "rLink": "https://hcp-uw.com/",
    "rImage": husky_coding_project_logo,
    "type": "Student clubs",
    "tags": ["Software Engineering"],
    "offers": ["Project teams"],
    "summary": [
      "Your launchpad for tech teamwork at UW",
      "A space to gain group project work experience in the tech field",
      "Open to students regardless of major or background",
    ],
  },
  {
    "rName": "Technology Consulting Association @ UW",
    "rDescription": "The premier technology consultancy.",
    "rLink": "https://linktr.ee/tca_uw?utm_source=ig&utm_medium=social&utm_content=link_in_bio",
    "rImage": tca_logo,
    "type": "Student clubs",
    "tags": ["PM/Consulting"],
    "offers": ["Project teams", "Career panels"],
    "summary": [
      "The premier technology consultancy",
    ],
  },
  {
    "rName": "iJournal",
    "rDescription": "iJournal is the UW Information School's student-run publication for thought pieces, research, opinions, and creative works about technology, information, and society.",
    "rLink": "https://www.ijournaluw.com/",
    "rImage": ijournal_logo,
    "type": "Student clubs",
    "tags": ["iOrgs"],
    "summary": [
      "Student-run publication of the UW Information School",
      "Publishes student thought pieces, research, opinions, and creative works",
      "Takes submissions every quarter from undergraduates in any major",
    ],
  },
  {
    "rName": "Product Management Club @ UW",
    "rDescription": "Product Management Club @ UW is a workshop-style community that offers resources, mentorship, and opportunities to students interested in a career in product management.",
    "rLink": "https://webimpactuw.github.io/pmclub-uw/",
    "rImage": pm_club_logo,
    "type": "Student clubs",
    "tags": ["PM/Consulting"],
    "offers": ["Career panels"],
    "summary": [
      "Workshop-style community for students interested in product management",
      "Resources, mentorship, and opportunities for a career in PM",
      "Events such as a Careers in Tech panel",
    ],
  },
  {
    "rName": "Montlake Consulting Group",
    "rDescription": "Montlake Consulting Group members consult on quarter-long strategy projects for Fortune 500 companies and startups.",
    "rLink": "https://montlakeconsulting.com/",
    "rImage": montlake_consulting_group_logo,
    "type": "Student clubs",
    "tags": ["PM/Consulting"],
    "offers": ["Project teams", "Competition"],
    "summary": [
      "Quarter-long strategy projects for Fortune 500 companies and startups",
      "Teams of 4 to 5 consultants led by a student project manager",
      "New members train for a quarter, ending in a pitch deck competition",
    ],
  },
  {
    "rName": "UW Consulting Association (UWCA)",
    "rDescription": "UWCA helps members build consulting knowledge and professional skills through weekly meetings, new member training, and client engagements.",
    "rLink": "https://www.uwconsulting.org/",
    "rImage": uw_consulting_association_logo,
    "type": "Student clubs",
    "tags": ["PM/Consulting"],
    "offers": ["Project teams", "Competition", "Career panels"],
    "summary": [
      "Weekly meetings with speaker panels, firm events, and interview prep workshops",
      "PIVOT pairs new members with an upperclass mentor for 7 weeks of training",
      "3 to 5 client engagements every quarter",
    ],
  },
  {
    "rName": "Business Impact Group (BIG)",
    "rDescription": "Business Impact Group's student consulting teams work with small business clients across Washington State and beyond.",
    "rLink": "https://www.uwbig.com/",
    "rImage": business_impact_group_logo,
    "type": "Student clubs",
    "tags": ["PM/Consulting"],
    "offers": ["Project teams"],
    "summary": [
      "Student consulting teams work 8 weeks alongside a small business client",
      "Clients across Washington State, the Pacific Northwest, and beyond",
      "New members start in CORE, a quarter of weekly consulting workshops",
    ],
  },
  {
    "rName": "Information Consulting Group (ICG)",
    "rDescription": "Information Consulting Group is a student-run consulting club at the iSchool that delivers technology and strategy projects for real organizations.",
    "rLink": "https://www.linkedin.com/company/washingtonicg",
    "rImage": information_consulting_group_logo,
    "type": "Student clubs",
    "tags": ["PM/Consulting"],
    "offers": ["Project teams"],
    "summary": [
      "Student-run technology consulting club at the iSchool, founded in 2025",
      "Members deliver technology and strategy projects for real organizations",
      "Focus groups in software engineering, data science, UI/UX design, and cybersecurity",
    ],
  },
  {
    "rName": "iStartup Lab",
    "rDescription": "The iSchool's iStartup Lab helps students learn about entrepreneurship, meet other founders, and launch new businesses and organizations.",
    "rLink": "https://startup.ischool.uw.edu/",
    "rImage": istartup_lab_logo,
    "type": "iSchool",
    "tags": ["Entrepreneurship"],
    "summary": [
      "Courses and community events about entrepreneurship",
      "Micro grants to help iSchool startup teams with upfront costs",
      "Open to students in every iSchool program",
    ],
  },
  {
    "rName": "Society of Women Engineers UW (SWE UW)",
    "rDescription": "SWE UW helps women and nonbinary engineers succeed in their careers, with programs and events for more than 500 students.",
    "rLink": "https://sweuw.org/",
    "rImage": swe_uw_logo,
    "type": "Student clubs",
    "tags": ["Software Engineering", "DEI"],
    "offers": ["Hackathon"],
    "summary": [
      "Supports women and nonbinary engineers in their careers",
      "Programs and events for more than 500 students",
      "UW section of the Society of Women Engineers",
    ],
  },
  {
    "rName": "Software Engineering Career Club (SWECC)",
    "rDescription": "SWECC is a student-led community that helps aspiring software engineers build the skills, experience, and connections to succeed in tech.",
    "rLink": "https://www.swecc.org/",
    "rImage": swecc_logo,
    "type": "Student clubs",
    "tags": ["Software Engineering"],
    "offers": ["Project teams"],
    "summary": [
      "Student-led community for aspiring software engineers",
      "Hands-on projects, mentorship, workshops, and a peer network",
      "SWECC Labs guides members through open-source contributions",
    ],
  },
  {
    "rName": "Web Impact UW",
    "rDescription": "Web Impact teaches web design and development and builds free websites for local communities and organizations in Seattle.",
    "rLink": "https://webimpactuw.org/",
    "rImage": web_impact_logo,
    "type": "Student clubs",
    "tags": ["Software Engineering"],
    "offers": ["Project teams"],
    "summary": [
      "Weekly web design and development workshops for all skill levels",
      "Student teams build free websites for Seattle organizations starting in Winter",
    ],
  },
  {
    "rName": "Data Science Society at UW",
    "rDescription": "The Data Science Society at UW makes data science accessible to students from all disciplines.",
    "rLink": "https://data-science-society-at-uw.github.io/club-website/",
    "rImage": data_science_society_logo,
    "type": "Student clubs",
    "tags": ["DS/ML"],
    "offers": ["Project teams"],
    "summary": [
      "Makes data science accessible to students from all disciplines",
      "Open to all UW students at any experience level",
      "Events, workshops, and a network of data science peers",
    ],
  },
  {
    "rName": "interactive intelligence (i2)",
    "rDescription": "interactive intelligence (i2) is UW's student-led NeuroAI education and research organization.",
    "rLink": "https://uw-i2.org/",
    "rImage": interactive_intelligence_logo,
    "type": "Student clubs",
    "tags": ["DS/ML"],
    "offers": ["Project teams"],
    "summary": [
      "Student-led NeuroAI education and research organization",
      "Intro course on machine learning and neuroscience, no background needed",
      "Research Room, a two-quarter program for joining real research projects",
    ],
  },
  {
    "rName": "Women in UX",
    "rDescription": "Women in UX connects women at UW in user experience and related fields through community and career-building events.",
    "rLink": "https://students.washington.edu/wiux/",
    "rImage": women_in_ux_logo,
    "type": "Student clubs",
    "tags": ["UI/UX", "DEI"],
    "summary": [
      "Community for women and gender-expansive designers",
      "An annual conference, industry networking, and portfolio reviews",
      "Open to undergraduate and graduate students of any gender",
    ],
  },
  {
    "rName": "UX Health @ UW",
    "rDescription": "UX Health is a student-led organization exploring the role of UX design and research in healthcare.",
    "rLink": "https://www.instagram.com/uxhealthuw/",
    "rImage": ux_health_logo,
    "type": "Student clubs",
    "tags": ["UI/UX"],
    "offers": ["Project teams", "Career panels"],
    "summary": [
      "Explores UX design and research in healthcare",
      "Design teams run Winter to Spring, with applications at the end of Fall",
    ],
  },
  {
    "rName": "ThinkCyber UW",
    "rDescription": "ThinkCyber UW is an inclusive, hands-on cybersecurity community for students of all backgrounds.",
    "rLink": "https://linktr.ee/thinkcyberuw",
    "rImage": thinkcyber_logo,
    "type": "Student clubs",
    "tags": ["Cybersecurity"],
    "summary": [
      "Inclusive, hands-on cybersecurity community for all backgrounds",
      "Study groups and panels, such as a Security+ study group",
    ],
  },
  {
    "rName": "Batman's Kitchen",
    "rDescription": "Batman's Kitchen is UW's cybersecurity club, open to every level of experience.",
    "rLink": "https://www.batmans.kitchen/",
    "rImage": batmans_kitchen_logo,
    "type": "Student clubs",
    "tags": ["Cybersecurity"],
    "offers": ["Competition"],
    "summary": [
      "Cybersecurity club open to every level of experience",
      "Weekly talks and Capture the Flag (CTF) nights",
      "Runs BKCTF and prepares students for the MITRE eCTF competition",
    ],
  },
  {
    "rName": "WiCyS UW",
    "rDescription": "WiCyS UW is the University of Washington Seattle student chapter of Women in CyberSecurity.",
    "rLink": "https://www.instagram.com/wicys.uw/",
    "rImage": wicys_uw_logo,
    "type": "Student clubs",
    "tags": ["Cybersecurity", "DEI"],
    "summary": [
      "UW Seattle student chapter of Women in CyberSecurity",
    ],
  },
];
