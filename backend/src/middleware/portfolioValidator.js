const MAX_SECTION_BYTES = 50 * 1024;

const SLUG_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

const VALID_SECTIONS = ['hero', 'projects', 'about', 'skills'];

const URL_KEYS = new Set(['url', 'link', 'href', 'website', 'github', 'linkedin', 'twitter']);
const IMAGE_URL_KEYS = new Set(['imageUrl', 'avatarUrl', 'photoUrl', 'image', 'avatar', 'photo', 'thumbnail']);
const ALL_URL_KEYS = new Set([...URL_KEYS, ...IMAGE_URL_KEYS]);

function stripHtml(value) {
  return value.replace(/<[^>]*>/g, '').trim();
}

function collectUrlErrors(obj, path, errors) {
  if (typeof obj !== 'object' || obj === null) return;

  if (Array.isArray(obj)) {
    obj.forEach((item, i) => collectUrlErrors(item, `${path}[${i}]`, errors));
    return;
  }

  for (const [key, value] of Object.entries(obj)) {
    const fullPath = `${path}.${key}`;

    if (typeof value === 'string' && value.length > 0) {
      if (IMAGE_URL_KEYS.has(key)) {
        if (!/^https:\/\/.+/.test(value)) {
          errors.push(`"${fullPath}" must be an HTTPS URL`);
        }
      } else if (URL_KEYS.has(key)) {
        if (!/^https?:\/\/.+/.test(value)) {
          errors.push(`"${fullPath}" must be a valid URL (http or https)`);
        }
      }
    } else if (typeof value === 'object') {
      collectUrlErrors(value, fullPath, errors);
    }
  }
}

function sanitizeObject(obj) {
  if (typeof obj === 'string') return stripHtml(obj);

  if (Array.isArray(obj)) return obj.map(sanitizeObject);

  if (typeof obj === 'object' && obj !== null) {
    const out = {};
    for (const [key, value] of Object.entries(obj)) {
      out[key] = ALL_URL_KEYS.has(key) ? value : sanitizeObject(value);
    }
    return out;
  }

  return obj;
}

export const validatePortfolioSlug = (req, res, next) => {
  const slug = req.params.slug ?? req.body?.slug;

  if (!slug) {
    return res.status(400).json({
      success: false,
      error: 'Portfolio slug is required.',
    });
  }

  if (!SLUG_PATTERN.test(slug)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid slug. Use only lowercase letters, numbers, and hyphens. Must start and end with a letter or number.',
    });
  }

  next();
};

export const validatePortfolioContent = (req, res, next) => {
  const { sections } = req.body ?? {};

  if (!sections || typeof sections !== 'object' || Array.isArray(sections)) {
    return res.status(400).json({
      success: false,
      error: '"sections" must be a non-null object.',
    });
  }

  const errors = [];
  const sanitized = {};

  for (const [name, content] of Object.entries(sections)) {
    if (!VALID_SECTIONS.includes(name)) {
      errors.push(`Unknown section "${name}". Allowed: ${VALID_SECTIONS.join(', ')}.`);
      continue;
    }

    if (Buffer.byteLength(JSON.stringify(content), 'utf8') > MAX_SECTION_BYTES) {
      errors.push(`Section "${name}" exceeds the 50KB size limit.`);
      continue;
    }

    collectUrlErrors(content, name, errors);

    sanitized[name] = sanitizeObject(content);
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Portfolio content validation failed.',
      details: errors,
    });
  }

  req.body.sections = sanitized;
  next();
};
