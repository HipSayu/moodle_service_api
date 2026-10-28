// MongoDB giả trong bộ nhớ, chỉ đủ các thao tác historyService dùng.
// Để test lịch sử không cần (và không đụng tới) MongoDB thật.

const get = (doc, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), doc);

const isId = (v) => v && typeof v === 'object' && typeof v.toHexString === 'function';
const comparable = (v) => (v instanceof Date ? v.getTime() : isId(v) ? String(v) : v);

const isOperatorObject = (cond) =>
  cond && typeof cond === 'object' && !(cond instanceof Date) && !isId(cond) &&
  Object.keys(cond).some((k) => k.startsWith('$'));

function matchValue(value, cond) {
  if (!isOperatorObject(cond)) return comparable(value) === comparable(cond);

  return Object.entries(cond).every(([op, arg]) => {
    const v = comparable(value);
    const a = comparable(arg);
    switch (op) {
      case '$regex': return value != null && new RegExp(arg, cond.$options || '').test(String(value));
      case '$options': return true;
      case '$gte': return v >= a;
      case '$gt': return v > a;
      case '$lte': return v <= a;
      case '$lt': return v < a;
      case '$ne': return v !== a;
      case '$in': return arg.map(comparable).includes(v);
      default: throw new Error(`fakeMongo: chưa hỗ trợ ${op}`);
    }
  });
}

const matches = (doc, filter = {}) =>
  Object.entries(filter).every(([key, cond]) =>
    key === '$or' ? cond.some((sub) => matches(doc, sub)) : matchValue(get(doc, key), cond)
  );

function project(doc, projection) {
  if (!projection) return { ...doc };
  const entries = Object.entries(projection);
  if (entries.every(([, v]) => !v)) {
    const out = { ...doc };
    entries.forEach(([k]) => delete out[k]);
    return out;
  }
  const out = { _id: doc._id };
  entries.forEach(([k, v]) => { if (v) out[k] = doc[k]; });
  return out;
}

function cursor(docsFn, projection) {
  let sortSpec = null;
  let skipN = 0;
  let limitN = Infinity;

  const run = () => {
    let docs = docsFn();
    if (sortSpec) {
      const [[key, dir]] = Object.entries(sortSpec);
      docs = [...docs].sort((x, y) => {
        const a = comparable(get(x, key));
        const b = comparable(get(y, key));
        return (a > b ? 1 : a < b ? -1 : 0) * dir;
      });
    }
    return docs.slice(skipN, skipN + limitN).map((d) => project(d, projection));
  };

  const api = {
    sort(spec) { sortSpec = spec; return api; },
    skip(n) { skipN = n; return api; },
    limit(n) { limitN = n; return api; },
    async toArray() { return run(); },
    async *[Symbol.asyncIterator]() { for (const d of run()) yield d; },
  };
  return api;
}

class FakeCollection {
  constructor() { this.docs = []; }

  async createIndex() { return 'ok'; }

  async insertOne(doc) { this.docs.push({ ...doc }); return { insertedId: doc._id }; }

  async insertMany(docs) { docs.forEach((d) => this.docs.push({ ...d })); return { insertedCount: docs.length }; }

  async updateOne(filter, update) {
    const doc = this.docs.find((d) => matches(d, filter));
    if (doc && update.$set) Object.assign(doc, update.$set);
    return { matchedCount: doc ? 1 : 0 };
  }

  async findOne(filter, opts = {}) {
    const doc = this.docs.find((d) => matches(d, filter));
    return doc ? project(doc, opts.projection) : null;
  }

  find(filter = {}, opts = {}) {
    return cursor(() => this.docs.filter((d) => matches(d, filter)), opts.projection);
  }

  async countDocuments(filter = {}) { return this.docs.filter((d) => matches(d, filter)).length; }

  // Chỉ hỗ trợ [$match, $group theo một trường với $sum: 1]
  aggregate(pipeline) {
    return {
      toArray: async () => {
        let docs = this.docs;
        for (const stage of pipeline) {
          if (stage.$match) docs = docs.filter((d) => matches(d, stage.$match));
          else if (stage.$group) {
            const field = stage.$group._id.replace(/^\$/, '');
            const counts = new Map();
            docs.forEach((d) => counts.set(d[field] ?? null, (counts.get(d[field] ?? null) || 0) + 1));
            docs = [...counts].map(([_id, count]) => ({ _id, count }));
          } else throw new Error('fakeMongo: stage chưa hỗ trợ');
        }
        return docs;
      },
    };
  }
}

export function createFakeDb() {
  const collections = new Map();
  return {
    collection(name) {
      if (!collections.has(name)) collections.set(name, new FakeCollection());
      return collections.get(name);
    },
  };
}
