import mongoose from "mongoose";

export const committeeRecruitmentSchema = new mongoose.Schema({
    committee: { type: String, required: true, unique: true },
    formUrl: { type: String, required: true },
    closesAt: { type: Date, required: true },
});

export const CREATIVE_COMMITTEE = "Creative";

const creativeRecruitmentDefaults = {
    committee: CREATIVE_COMMITTEE,
    formUrl: "https://docs.google.com/forms/d/e/1FAIpQLScLSHKvodPVaOamDhxKH1GG7kiX2CXIhUFjlspSBp5NFw-5JA/viewform",
    closesAt: new Date("2026-10-18T23:59:00-07:00"),
};

export function seedCreativeRecruitment(committeeRecruitment) {
    return committeeRecruitment.updateOne(
        { committee: creativeRecruitmentDefaults.committee },
        { $setOnInsert: creativeRecruitmentDefaults },
        { upsert: true }
    );
}
