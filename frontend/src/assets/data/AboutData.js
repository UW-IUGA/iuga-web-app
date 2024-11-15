import { officerPositions } from "./Enum";
import { team_2024 } from "./teams/2024";
import { team_2023 } from "./teams/2023";
import { team_2022 } from "./teams/2022";
import { team_2021 } from "./teams/2021";
import { team_2020 } from "./teams/2020";
import { team_2019 } from "./teams/2019";
import { team_2018 } from "./teams/2018";
import { team_2017 } from "./teams/2017";
import { team_2016 } from "./teams/2016";
import { team_2015 } from "./teams/2015";

export const iugaTeams = {
    2024: team_2024,
    2023: team_2023,
    2022: team_2022,
    2021: team_2021,
    2020: team_2020,
    2019: team_2019,
    2018: team_2018,
    2017: team_2017,
    2016: team_2016,
    2015: team_2015,
};

export const positionInformation = {
    positionInformation: {
        [officerPositions.PRESIDENT]: {
            description: "The President is the head of IUGA and their responsibilities include:",
            responsibilities: [
                "Lead IUGA Meetings",
                "Represent Informatics to faculty and staff with the Vice President",
                "Shepherd and guide newly elected IUGA Officers during the annual transition",
                "Act as backup for the Director of Finance for financial matters",
                "Act as, or designate, the Informatics Representative On the iSchool Program Committee",
                "Act as liaison to other iSchool student organizations",
            ],
        },
        [officerPositions.COPRESIDENT]: {
            description: "The Co-Presidents are the joint heads of IUGA and their responsibilities include:",
            responsibilities: [
                "Co-lead IUGA Meetings",
                "Assist each other in representing Informatics to faculty and staff",
                "Shepherd and guide newly elected IUGA Officers during the annual transition",
                "Act as backup for the Director of Finance for financial matters",
                "Act as, or designate, the Informatics Representative On the iSchool Program Committee",
                "Act as liaison to other iSchool student organizations",
            ],
        },
        [officerPositions.VICE_PRESIDENT]: {
            description:
                "The Vice President fills roles as needed and has core repsonsibilities with which they are entrusted. These core responsibilities include the following:",
            responsibilities: [
                "Backup for the President",
                "Collaborates with the Director of Outreach when communicating with External Groups",
                "Responsible for scheduling bi-weekly meetings",
                "Responsible for booking venues for all IUGA events",
                "Responsible for handling the yearly Registration of IUGA with the SAO",
                "Responsible for the meeting minutes of every IUGA meeting",
                "Act as the Primary Point of Contact for Student Services when dealing with the Informatics Recruitment Process",
                "Fulfill or Designate a student to fill a seat on the iSchool Student Leadership Committee and the Informatics Program Committee",
            ],
        },
        [officerPositions.FINANCE]: {
            description:
                "The director of finance maintains the Association’s financial records. This includes the following items:",
            responsibilities: [
                "Maintain the Financial Records",
                "Provide Reports On Finances to IUGA",
                "Fulfill or Designate a Student Representative for Informatics on the iSchool Student Leadership Committee",
                "Organize the Financial Vectors of IUGA fundraising efforts",
                "Prepare and Submit the Yearly IUGA Budget to iSchool Administration",
                "Act as the Primary Account Holder for All IUGA Financial Accounts",
                "Handle merchandise ordering and distribution",
                "Help the incoming Director of Finance with the Yearly Budget during Spring Quarter",
            ],
        },
        [officerPositions.CREATIVE]: {
            description:
                "The Creative Director will work on creating the visual style of the IUGA brand and take initiative in creating and delivering branded items. These responsibilities will include:",
            responsibilities: [
                "Creating merchandise for IUGA, including clothing",
                "Creating informational posters/flyers for IUGA events",
                "Maintain the IUGA logo and design styling",
                "Create a team to help in the creation of Informatics branded items",
                "Assist Finance with ordering and distribution of merchandise",
            ],
        },
        [officerPositions.PUBLIC_RELATIONS]: {
            description:
                "The Director of Public Relations serves a vital communication role within the Executive Council. These responsibilities Include:",
            responsibilities: [
                "Communicate Announcement and Events to Informatics Students",
                "Lead the Planning and Organization of Social Events",
                "Ensure the Smooth Operation and Execution of All IUGA events",
                "Oversee Elections",
            ],
        },
        [officerPositions.OUTREACH]: {
            description:
                "The Director of Outreach is responsible for representing both the Informatics Program and the IUGA to the professional community. They do this by:",
            responsibilities: [
                "Working with Students Services and the Career Center to promote employment and professional development events.",
                "Work with Student Services to facilitate alumni relations",
                "Promote Informatics to the University of Washington at Large and the Professional Community Along with the Vice President",
                "Responsible for organizing and executing professional development events for Informatics",
            ],
        },
        [officerPositions.DIVERSITY]: {
            description:
                "The Director of Diversity Efforts works to promote diversity both within the major and the iSchool. This includes, but is not limited to, the following:",
            responsibilities: [
                "Support and promote activist-oriented RSOs",
                "Organize and promote diversity and inclusion events for the iSchool",
                "Work closely with the Diversity Programs Advisor to ideate and execute diversity initiatives",
                "Support and engage in an active Diversity Committee composed of students, faculty and staff",
                "Fulfill, or appoint a student, to sit on the Informatics Admissions Committee during the summer",
                "Ensure that the events, ideas, and products of IUGA are made with the thought of diversity and inclusion",
                "Collaborate with Student Services and other Registered Student Organizations (RSOs) on campus for diversity and inclusion events",
            ],
        },
        [officerPositions.IT]: {
            description:
                "The Director of Information Technology helps run the Association’s technology projects and online presence. While providing support when needed. This is done by doing the following:",
            responsibilities: [
                "Maintain and update the IUGA Website and associated websites using the latest web technologies",
                "Monitor and maintain the IUGA gaming servers and associated assets",
                "Maintain all IUGA online account credentials in a secure and scalable system",
                "Manage permissions and security settings for IUGA assets across social networks and collaborative systems",
                "Oversee and run technology aspects of IUGA events, including the quarterly Game Night",
                "Work closely with iSchool IT and the Administration to connect the student body with all available technology and services",
                "Support, Service, and Create Technology solutions for needs within the Association and the iSchool",
            ],
        },
        [officerPositions.ACADEMIC]: {
            description:
                "The Director of Academic Support is responsible for supporting the academic needs within the Informatics Program. These responsibilities include:",
            responsibilities: [
                "Understand the needs of current students",
                "Organize and promote academic related events",
                "Work closely with other organizations to conduct joint events",
            ],
        },
    },
}
