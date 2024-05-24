import { resourceTags } from './Enum';
import uw_logo from "../logos/uw-logo.png";
import ischool_logo from "../logos/ischool-logo.png";
import canvas_logo from "../logos/canvas-logo.png";
import iqueeries_logo from "../logos/iqueeries-logo.png";
import winfo_logo from "../logos/winfo-logo.jpeg";
import binfo_logo from "../logos/binfo-logo.png";
import isaca_logo from "../logos/isaca-logo.png";

export const mockResources = {
  [resourceTags.ACADEMIC]: [
    {
      "rName": "iSchool Student Services",
      "rDescription": "iSchool staff are here to help provide you with quality support throughout your iSchool experience as you explore, develop and pursue opportunities that align with your life and career goals. Advising hours and scheduling instructions are listed below for graduate admissions, academic and career advisors. Most programs host appointments online or in-person.",
      "rLink": "https://ischool.uw.edu/advising-support",
      "rImage": ischool_logo,
    },
    {
      "rName": "iSchool Peer Advisors",
      "rDescription": "The Informatics Peer Advisor team meets with current INFO students and current UW students who are considering applying to the Informatics major.",
      "rLink": "https://ischool.uw.edu/advising-support#:~:text=Informatics%20peer%20advisors",
      "rImage": ischool_logo,
    },
  ],
  [resourceTags.CAREER]: [
    {
      "rName": "iSchool Career Services (Canvas)",
      "rDescription": "The iSchool Career Services team is excited to help support you in meeting your professional development goals and navigating the job search process. Our team provides one-on-one advising, help with job search strategies and specific opportunities, resume and cover letter feedback, and interview advice and practice.",
      "rLink": "https://canvas.uw.edu/courses/1614908",
      "rImage": canvas_logo,
    },
    {
      "rName": "iMentorship",
      "rDescription": "The mission of the iMentorship Program is to support students in the iSchool’s Bachelor of Science in Informatics and Master of Science in Information Management (MSIM) programs as they pursue their professional dreams by enabling each student to work closely, one-on-one, with an information professional who can provide insight, guidance and support, and can help the student jumpstart a professional network.",
      "rLink": "https://ischool.uw.edu/alumni/get-involved/imentorship",
      "rImage": ischool_logo,
    },
  ],
  [resourceTags.MENTAL_HEALTH]: [
    {
      "rName": "Husky Health & Well-Being",
      "rDescription": "UW Seattle offers a wide range of health and wellness services, from exceptional medical care and counseling services to recreation classes, safety resources, peer health advocacy, trainings and more. Most services on this site are limited to currently enrolled UW Seattle students, while others are open to faculty, staff and the general public.",
      "rLink": "https://wellbeing.uw.edu/",
      "rImage": uw_logo,
    },
    {
      "rName": "Leigh Eisele, LMHC, LCPC, NCC",
      "rDescription": "Clinical Mental Health Therapist and Liaison to the College of Built Environments and iSchool.",
      "rLink": "https://wellbeing.uw.edu/staff/leigh-eisele-lmhc-lcpc-ncc/",
      "rImage": uw_logo,
    },
  ],
  [resourceTags.DEI]: [
    {
      "rName": "iSchool Office of IDEAS ",
      "rDescription": "At the iSchool, inclusion and connectedness are celebrated as essential components of academic excellence.",
      "rLink": "https://ischool.uw.edu/diversity",
      "rImage": ischool_logo,
    },
    {
      "rName": "Diversity @ UW",
      "rDescription": "At the University of Washington, diversity, equity, inclusion and belonging are integral to excellence. We value and honor diverse identities, experiences, and perspectives, strive to create accessible, welcoming, and respectful learning environments, and promote access, opportunity, and justice for all.",
      "rLink": "https://www.washington.edu/diversity/",
      "rImage": uw_logo,
    },
  ],
  [resourceTags.COMMUNITY]: [
    {
      "rName": "Women in Informatics (Winfo)",
      "rDescription": "Women in Informatics supports ways to empower women to thrive as producers of technology. Winfo is a supportive network of women in technology fields who provide students with mentorship, resources and support toward career development and academic pursuits.",
      "rLink": "http://winfo.ischool.uw.edu/",
      "rImage": winfo_logo,
    },
    {
      "rName": "iQueeries",
      "rDescription": "iQueeries provides a safe, positive, and nurturing space for LGBTQIA+ and supportive ally students in the Information School. It works to foster a strong, supportive queer community within the iSchool as well as UW at large, and to promote positive change and social justice within the field of information sciences. iQueeries is intersectional: all identities and experiences are welcome and encouraged to share their voices.",
      "rLink": "https://depts.washington.edu/ischoolq/",
      "rImage": iqueeries_logo,
    },
    {
      "rName": "Black in Informatics (Binfo)",
      "rDescription": "Black in Informatics is a community-driven organization dedicated to fostering the professional, academic, and personal development of Black students within the Informatics program. Its mission is to amplify the presence and successes of Black students in Informatics, guiding them throughout their journey at UW with resources, mentorship, and specialized learning experiences.",
      "rLink": "https://linktr.ee/binfouw",
      "rImage": binfo_logo,
    },
    {
      "rName": "ISACA",
      "rDescription": "ISACA aims to engage students who are interested in learning about information security and risk. This student group accomplishes this by hosting workshops and events that teach students about basic information security procedures and best practices.",
      "rLink": "https://www.instagram.com/isacauw/",
      "rImage": isaca_logo,
    },
  ],
}