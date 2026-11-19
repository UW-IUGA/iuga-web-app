// In-memory stand-in for the slice of a Mongoose model these Discord flows use.
// It checks the flows' logic only; real index and concurrency behavior needs MongoDB.

function matchesValue(actual, condition) {
  if (condition && typeof condition === "object" && !(condition instanceof Date) && !Array.isArray(condition)) {
    if ("$in" in condition) return condition.$in.some((value) => String(value) === String(actual));
    if ("$lt" in condition) return actual !== undefined && actual !== null && actual < condition.$lt;
    if ("$regex" in condition) return typeof actual === "string" && new RegExp(condition.$regex).test(actual);
  }
  if (condition === null) return actual === null || actual === undefined;
  return String(actual) === String(condition);
}

export function matches(doc, filter) {
  return Object.entries(filter).every(([key, condition]) => {
    if (key === "$or") return condition.some((branch) => matches(doc, branch));
    return matchesValue(doc[key], condition);
  });
}

/*
 * @param uniqueKeys — field lists that must be unique among docs where every listed field is set
 */
export function createFakeCollection({ uniqueKeys = [] } = {}) {
  const docs = [];
  let sequence = 0;
  const copy = (doc) => (doc ? structuredClone(doc) : null);
  const duplicateOf = (candidate) =>
    uniqueKeys.some((fields) =>
      fields.every((field) => candidate[field] !== undefined && candidate[field] !== null) &&
      docs.some((doc) => doc !== candidate && fields.every((field) => String(doc[field]) === String(candidate[field]))),
    );
  const duplicateError = () => Object.assign(new Error("E11000 duplicate key"), { code: 11000 });
  const apply = (doc, update) => {
    Object.assign(doc, structuredClone(update.$set ?? {}));
    for (const key of Object.keys(update.$unset ?? {})) delete doc[key];
  };

  const collection = {
    docs,
    async create(fields) {
      const doc = { _id: String(++sequence).padStart(24, "0"), ...structuredClone(fields) };
      if (duplicateOf(doc)) throw duplicateError();
      docs.push(doc);
      return copy(doc);
    },
    async findById(id) {
      return copy(docs.find((doc) => doc._id === String(id)) ?? null);
    },
    async findOne(filter) {
      return copy(docs.find((doc) => matches(doc, filter)) ?? null);
    },
    async find(filter, _projection, options = {}) {
      const found = docs.filter((doc) => matches(doc, filter)).map(copy);
      return options.limit ? found.slice(0, options.limit) : found;
    },
    async findOneAndUpdate(filter, update) {
      const doc = docs.find((candidate) => matches(candidate, filter));
      if (!doc) return null;
      const before = structuredClone(doc);
      apply(doc, update);
      if (duplicateOf(doc)) {
        Object.keys(doc).forEach((key) => delete doc[key]);
        Object.assign(doc, before);
        throw duplicateError();
      }
      return copy(doc);
    },
    async updateOne(filter, update) {
      const doc = docs.find((candidate) => matches(candidate, filter));
      if (doc) apply(doc, update);
      return { matchedCount: doc ? 1 : 0 };
    },
    async deleteOne(filter) {
      const index = docs.findIndex((candidate) => matches(candidate, filter));
      if (index >= 0) docs.splice(index, 1);
      return { deletedCount: index >= 0 ? 1 : 0 };
    },
  };
  return collection;
}
