javascriptimport { load } from 'cheerio';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    const response = await fetch(url);
    const html = await response.text();
    const $ = load(html);

    const title = $('h1').first().text().trim() || $('title').text().trim();
    const ministry = extractMinistry(url);
    const bodyText = $('main, article, .content, body').text().replace(/\s+/g, ' ').trim().substring(0, 1000);

    const doc = {
      title: title || 'タイトル不明',
      council: extractCouncilName(title, url),
      ministry: ministry,
      date: new Date().toISOString().split('T')[0],
      type: '議事録',
      format: 'html',
      url: url,
      summary: bodyText.substring(0, 100),
      text: bodyText
    };

    res.status(200).json(doc);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

function extractMinistry(url) {
  if (url.includes('digital.go.jp')) return 'デジタル庁';
  if (url.includes('cao.go.jp')) return '内閣府';
  if (url.includes('soumu.go.jp')) return '総務省';
  if (url.includes('meti.go.jp')) return '経済産業省';
  if (url.includes('mhlw.go.jp')) return '厚生労働省';
  if (url.includes('mext.go.jp')) return '文部科学省';
  if (url.includes('nisc.go.jp')) return '内閣官房';
  if (url.includes('ppc.go.jp')) return '個人情報保護委員会';
  return '不明';
}

function extractCouncilName(title, url) {
  if (!title) return '会議名不明';
  const match = title.match(/(.+?)(?:第\d+回|議事録|配布資料)/);
  return match ? match[1].trim() : title.split(/\s/)[0];
}