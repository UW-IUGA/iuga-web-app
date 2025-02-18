import { candidatePositions, groupType } from "../Enum";
import { officerPositions } from "../Enum";

// Lower the resolution of the image if the picture looks grainy
// https://adobe.com/express/feature/image/resize
// https://stackoverflow.com/questions/74502978/object-fit-cover-gives-pixelated-images-on-chrome

/* 2025 candidates images */
import _2025_bright from "../candidatePhotos/2025/bright_candidate.png";
import _2025_abraham from "../candidatePhotos/2025/abraham_candidate.jpeg";
import _2025_george from "../candidatePhotos/2025/george_candidate.jpg";
import _2025_izzy from "../candidatePhotos/2025/izzy_candidate.jpeg";
import _2025_preeti from "../candidatePhotos/2025/preeti_candidate.png";
import _2025_nhu from "../candidatePhotos/2025/nhu_candidate.jpeg";
import _2025_carlos from "../candidatePhotos/2025/carlos_candidate.jpg";
import _2025_camilo from "../candidatePhotos/2025/camilo_candidate.jpeg";
import _2025_asmi from "../candidatePhotos/2025/asmi_candidate.jpg";
import _2025_akshat from "../candidatePhotos/2025/akshat_candidate.jpg";

/* 2025 candidates media */
import _2025_bright_media from "../elections/2025/bright_2025.pdf";
import _2025_abraham_media from "../elections/2025/abraham_2025.pdf";
import _2025_george_media from "../elections/2025/george_2025.pdf";
import _2025_izzy_media from "../elections/2025/izzy_2025.pdf";
import _2025_preeti_media from "../elections/2025/preeti_2025.pdf";
import _2025_nhu_media from "../elections/2025/nhu_2025.pdf";
import _2025_carlos_media from "../elections/2025/carlos_2025.jpg";
import _2025_camilo_media from "../elections/2025/camilo_2025.png";
import _2025_asmi_media from "../elections/2025/asmi_2025.pdf";
import _2025_akshat_media from "../elections/2025/akshat_2025.pdf";

export const candidates_2025 = [
    {
        position: candidatePositions.PRESIDENT,
        name: "Bright Hoang",
        picture: _2025_bright,
        basic_info: {
            major: "",
            year: "",
            pronouns: "", 
        },
        blurb: "Greetings! My name is Bright Hoang, and I have had the great pleasure of serving as the Informatics Undergraduate Associate (IUGA) Director of Outreach for the current 2024-25 academic year. I am excited to announce that I will be running to be your President for the upcoming year! Throughout my time during this process, I have learned many valuable lessons and had unforgettable experiences while working with my team to cater to the needs of our department. I have worked on many projects like organizing a case competition, running iFormal logistics, coordinating industry panels, and more. Even before my time in IUGA, I have been a member of the iSchool community, which has been one of the most valuable experiences in my academic career. I have had the chance to interact with so many bright individuals and future leaders of information technology. Being a part of this community, I understand the importance of empathy, reassurance, and inclusion, and as president, I am committed to supporting the students of the iSchool.",
        media: _2025_bright_media,
    },
    {
        position: candidatePositions.VICE_PRESIDENT,
        name: "Abraham Gibson",
        picture: _2025_abraham,
        basic_info: {
            major: "",
            year: "",
            pronouns: "", 
        },
        blurb: "Hey iSchoolers, My name is Abraham Gibson and I'm a Junior here at the iSchool. I'm an international student from Singapore and transferred into the UW last Fall from Green River College. Cool fact: I served in the military for about 3 years before embarking on my college journey in the US. I consider myself to be someone who enjoys working within the collective, cherishes community and genuinely wants to make a positive difference wherever I go. What motivates me is people, and how I can help or better support my community. That would be all of you here at the iSchool.  I am currently involved within IUGA as a First-Year Representative as well as am a TA for INFO 380 this quarter. These experiences have allowed me to meet a diverse group of students all around the iSchool, and to learn about their experiences here at the UW from their perspectives. Through this conversations, I've been able to learn about the amazing support and opportunities offered but at the same time also understand the shortcomings and pain points many of us encounter as students under the banner of the Information School. I intend to address these shortcomings and explore avenues for improvement.  I have grown deeply attached to the iSchool as it has given me a community I can count on. I want to inspire a stronger sense of community and collaboration between not just students, but staff and faculty as well. I want to involve our students more curriculum discussions and other initiatives at the iSchool to ensure student voice is represented equitably in all arrears. I want to create and organize more meaningful events for networking, professional development and mentorship to assist students in pursuing their ambitions. I want to serve you and be your Vice-President!",
        media: _2025_abraham_media,
    },
    {
        position: candidatePositions.FINANCE,
        name: "George Lee",
        picture: _2025_george,
        basic_info: {
            major: "",
            year: "",
            pronouns: "", 
        },
        blurb: "Hi, I am George, and I’m seeking your vote for Director of Finance in this upcoming election! Informatics has been such an awesome experience for me in these last few years! There’s a sense of camaraderie and community that I haven’t seen anywhere else on UW. This welcoming atmosphere has built the foundations of what makes me, me. I want to give back to this program in some small but impactful way. Being the Director of Finance would be the perfect place for me to do so, ensuring our student organization continues to have the financial stability needed to continue supporting and uplifting our community.       As a current First Year Rep on the IUGA board, I have firsthand experience organizing events, coordinating with recruiters, alumni, and faculty, and understanding the financial considerations that go into the awesome events you see every quarter. I have the prerequisite knowledge to be up and running, giving IUGA the clearance to plan events without sweating budgetary details.      I am also a TA for INFO 201. As the premier data course in the INFO department, I have gained an appreciation in exactly how we can use data to solve our problems. I plan to convert my experiences in using data to drive IUGA’s financial decisions, ensuring that every dollar spent has a direct and meaningful impact on our student body.      Thanks for considering my candidacy for Director of Finance. I look forward to serving the ISchool community, and creating even more fun memories in the upcoming year!",
        media: _2025_george_media,
    },
    {
        position: candidatePositions.PUBLIC_RELATIONS,
        name: "Izzy Saccone",
        picture: _2025_izzy,
        basic_info: {
            major: "",
            year: "",
            pronouns: "", 
        },
        blurb: "Hi! My name is Izzy, and I am a third-year Informatics student concentrating on UI/UX design. In my free time you can usually find me playing various sports (tennis, basketball, soccer, snowboarding), cooking new recipes, or shopping online. I am running for this position because I am passionate about design and how marketing can be used to bring people together. I have a year’s experience running the social media platforms for my business fraternity, and in that time I’ve learned just how powerful (and fun!) marketing is for creating community. It is really fulfilling to create a sort of visual summary of all the amazing accomplishments and events of an organization to show the UW community, and I would love to do that for IUGA. I think IUGA holds the unique position of having a strong connection to the entire iSchool, differently from other (also wonderful) clubs such as WINFO and HCP, which cater more towards specific demographics like women and students interested in coding. IUGA’s reach is really special as it encompasses all demographics of the iSchool community, the diversity of which is one of the coolest things about the Informatics major in my opinion. As an officer, I would strive to strengthen IUGA’s social media presence by creating marketing materials that attract a diverse range of people in the iSchool community and represent the IUGA brand in a fresh, innovative way. My goal would be to make the iSchool community more connected, and ensure that all students feel supported by IUGA in their INFO journey.",
        media: _2025_izzy_media,
    },
    {
        position: candidatePositions.OUTREACH,
        name: "Preeti Kotipalli",
        picture: _2025_preeti,
        basic_info: {
            major: "",
            year: "",
            pronouns: "", 
        },
        blurb: "Hi, my name is Preeti! I am a first year INFO student and First Year Representative (FYR) at IUGA. I am running to be IUGA’s next Director of Outreach. As someone passionate about bridging connections within our community, I want to strengthen relationships between students, faculty, alumni, and industry professionals to create more opportunities for all of us. In my time as an IUGA FYR, I’ve collaborated with the executive board the past few months bringing in fresh ideas, representing first-year interests, and shadowing board members to better understand their roles. This has helped me thoroughly understand IUGA’s inner workings and make my transition as an executive officer seamless. As Director of Outreach, I aim to strengthen connections with alumni and other leaders who work in fields that us Informatics students desire to work in and bring them in for panel events. Being the Director of Outreach would help me understand all the moving parts associated with building up students’ networks and educating students about industries they can venture into.  Learning about these processes will further help me align with IUGA’s goals and act on the needs of fellow students. Through this, I’ll also be able to not only impactfully contribute to future IUGA projects, but also other leadership roles as I navigate my educational and professional life.  To me, being an officer on IUGA means getting the opportunity to represent the interests of Informatics students and be able to present opportunities to students that they are genuinely interested in and passionate about. Don’t Skip voting for me!",
        media: _2025_preeti_media,
    },
    {
        position: candidatePositions.DIVERSITY,
        name: "Carlos Marroquin",
        picture: _2025_carlos,
        basic_info: {
            major: "",
            year: "",
            pronouns: "", 
        },
        blurb: "I am Carlos Marroquin, an international student who moved here for college from Mexico. When I first got into college frankly, I was a little lost. Overwhelmed by moving to a new country as well as the feeling that I had to make my time here worth it. Soon after getting into UW, I heard about Informatics, I was fascinated and instantly wanted to become  an Informatics major. I attended as many IUGA events as possible to learn as much as I could and have the best chances to get into my major. Now looking back I can confidently say I wouldn’t have made it without the help of not only diversity efforts, but the IUGA community as a whole. The people that I met, and their wisdom guided me through my application process, giving me the tools required to give it my best shot and in my second attempt I got in. Now I want to pay it back. I want to help guide those people who are interested but may not know the best way to go about it. Those people who want to build a community in IUGA. Those people who are international students like myself. I want to be as helpful to the IUGA community as it once was to me.",
        media: _2025_carlos_media,
    },
    {
        position: candidatePositions.DIVERSITY,
        name: "Nhu Tat",
        picture: _2025_nhu,
        basic_info: {
            major: "",
            year: "",
            pronouns: "", 
        },
        blurb:
            `👋Hello! My name is Nhu (she/her) and I’m the right choice to be your Director of Diversity Efforts! I’m a third-year Informatics student (minoring in GWSS & Diversity) passionate about using technology to cultivate access, liberation, and joy within marginalized communities.
            We are in a political climate where DEI is under attack, particularly in tech (think Zuckerberg’s campaign for “masculine energy”). Now more than ever, we at the iSchool must advocate for fostering greater diversity.
            Informatics is a program that empowers its students to harness the potential of technology and data for social good. Beyond just code and data structures, we study tech’s broader societal impact.

            My time as Web & Operations Coordinator at the Q Center has given me hands-on experience using data-driven approaches to enhance access and equity for LGBTQ+ students. This includes:
                    1) Developing automated inventory tracking systems for programs that distribute free menstrual products and gender-affirming items
                    2) Conducting programmatic data analyses that successfully advocated for a $33K budget increase
                    3) Maintaining a website (~1.2K MAU) to provide accurate LGBTQ+ resources and information

            Additionally, I serve on the Trans, Non-Binary & Gender Expansive (TNBGE) Tech Advisory Committee, working to ensure tech decisions at UW prioritize the safety and well-being of TNBGE communities.

                As Director of Diversity Efforts, I will:
                1) Provide networking opportunities with diverse changemakers in tech 🌐
                2) Expand educational outreach to local Black & brown high schoolers about the Informatics program 🚀
                3) Foster collaboration with Informatics affinity RSOs (WINFO, BINFO, iMuslims, iQueeries, etc.) through initiatives like joint events, mentorship programs, and resource-sharing 💫
                4) Continue fostering an inclusive, welcoming, diverse iSchool 🌈

            Diversity is the foundation for ethical, innovative, and impactful technology. With me as your Director of Diversity Efforts, it won’t just be a talking point, it will be a priority.`,
        media: _2025_nhu_media,
    },
    {
        position: candidatePositions.IT,
        name: "Camilo Montes",
        picture: _2025_camilo,
        basic_info: {
            major: "",
            year: "",
            pronouns: "", 
        },
        blurb: "Hi everyone! My name is Camilo Montes De Haro, and I’m excited to be running for Director of IT at IUGA. As a current member of the IT Committee, I’ve been organizing tech-related events, gaining firsthand experience in a role similar to the Director of IT. I want to continue this work by expanding IUGA’s digital presence, maintaining and improving our website based on student feedback, and ensuring our online platforms serve as valuable resources for everyone. Beyond website management, I aim to host more IT and tech-related events to help students build skills and explore career opportunities. Additionally, I plan to collaborate with other RSOs to introduce more students to the possibilities within Informatics. I was drawn to Informatics because of its goal of using technology to help people and its dedication to fostering a diverse, collaborative community. As Director of IT, I want to strengthen that sense of connection by creating a more close-knit and engaged undergraduate community. (Side note: I may be doing a study abroad for a quarter next year, but I'm leaning towards an early fall start before the academic year begins!) I’d love your support—thank you!",
        media: _2025_camilo_media,
    },
    {
        position: candidatePositions.IT,
        name: "Asmi Sathaye",
        picture: _2025_asmi,
        basic_info: {
            major: "",
            year: "",
            pronouns: "", 
        },
        blurb: "Hi everyone! I’m Asmi, and I’m excited to run for Director of Information Technology for IUGA. As a third year Informatics student passionate about the intersection of technology and accessibility, I want to make sure our digital resources serve everyone in our community effectively. Through my experiences in teaching, research, and technical projects, I’ve seen firsthand how thoughtful design and strong technical infrastructure can shape inclusive, impactful experiences. IUGA plays a crucial role in connecting students, and I want to ensure our online platforms reflect that – whether through improving usability, streamlining information access, or enhancing engagement with the broader iSchool community. If elected, I’ll work to make IUGA’s tech more intuitive, accessible, and valuable for everyone, and ensure that it isn’t just functional, but a tool that empowers and connects our community.",
        media: _2025_asmi_media,
    },
    {
        position: candidatePositions.ACADEMIC,
        name: "Akshat Ghuge",
        picture: _2025_akshat,
        basic_info: {
            major: "",
            year: "",
            pronouns: "", 
        },
        blurb: "Hi everyone! I’m Akshat Ghuge, and I’m running to be your next IUGA Director of Academic Support! As someone passionate about the learning process, I bring relevant experience that I believe would allow me to serve you effectively. As one of IUGA’s First-Year Representatives, I’ve helped organize events to foster your academic growth, like the Town Hall and Intern Panel. Additionally, leading my high school’s 300-person band as Vice President and developing educational musical programs for Notelove, a nationwide music education non-profit, has equipped me with the skills to work with diverse groups, coordinate large-scale informational events, and lead by service over hierarchy. With my passion for education, knowledge of IUGA and the iSchool’s resources, and commitment to community-building, I am eager to contribute to the continued growth of the iSchool’s community. If elected, I will work to continue providing enriching academic experiences, including panels with industry professionals, workshops to develop technical and professional skills, and partnerships with faculty to highlight the iSchool’s various resources! I also aim to increase engagement at IUGA’s events. To do this, I will implement continuous feedback systems, allowing you to voice your thoughts anytime so our events remain valuable and relevant. Finally, I aim to further strengthen the iSchool’s community. While academic support involves providing you with the tools to succeed, a supportive and collaborative environment is equally as important for success. As such, I hope to implement more social events, such as an iSchool-wide volleyball tournament! Between my experiences and my goals, I am confident that I can enhance your academic experience as your Director of Academic Support. A vote for me is a vote for you - I will ensure that your voice is heard and that you receive the tools to succeed. Thank you for your time and consideration. Vote Akshat!",
        media: _2025_akshat_media,
    },
]