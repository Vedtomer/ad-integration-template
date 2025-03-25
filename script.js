// RSS Feed URLs for major Indian news sources
const RSS_FEEDS = [
  {
    url: 'https://feeds.feedburner.com/ndtvnews-india-news',
    source: 'NDTV'
  },
  {
    url: 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms',
    source: 'Times of India'
  },
  {
    url: 'https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml',
    source: 'Hindustan Times'
  },
  {
    url: 'https://indianexpress.com/feed/',
    source: 'Indian Express'
  }
];

async function fetchRSSFeed(feedUrl) {
  try {
    // Using a CORS proxy to fetch RSS feeds
    const response = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(feedUrl)}`);
    const text = await response.text();
    
    // Parse XML
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, 'text/xml');
    const items = xml.querySelectorAll('item');
    
    return Array.from(items).map(item => ({
      title: item.querySelector('title')?.textContent || '',
      description: item.querySelector('description')?.textContent.replace(/<\/?[^>]+(>|$)/g, '') || '',
      url: item.querySelector('link')?.textContent || '',
      published_at: item.querySelector('pubDate')?.textContent || '',
      image_url: extractImageUrl(item),
      source: item.querySelector('source')?.textContent || ''
    }));
  } catch (error) {
    console.error('Error fetching RSS feed:', error);
    return [];
  }
}

function extractImageUrl(item) {
  // Try different common RSS image tags
  const mediaContent = item.querySelector('media\\:content, content');
  const enclosure = item.querySelector('enclosure');
  const imageTag = item.querySelector('image');
  
  if (mediaContent?.getAttribute('url')) {
    return mediaContent.getAttribute('url');
  } else if (enclosure?.getAttribute('url')) {
    return enclosure.getAttribute('url');
  } else if (imageTag?.querySelector('url')) {
    return imageTag.querySelector('url').textContent;
  }
  
  // Try to extract image from description if no dedicated image tag exists
  const description = item.querySelector('description')?.textContent || '';
  const imgMatch = description.match(/<img[^>]+src="([^">]+)"/);
  return imgMatch ? imgMatch[1] : '/api/placeholder/400/200';
}

async function fetchNews(searchQuery = '') {
  try {
    let allArticles = [];
    
    // Fetch from all RSS feeds
    for (const feed of RSS_FEEDS) {
      const articles = await fetchRSSFeed(feed.url);
      articles.forEach(article => {
        article.source = feed.source;
      });
      allArticles = allArticles.concat(articles);
    }

    // Sort by date
    allArticles.sort((a, b) => 
      new Date(b.published_at) - new Date(a.published_at)
    );

    // Filter by search query if provided
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      allArticles = allArticles.filter(article =>
        article.title.toLowerCase().includes(query) ||
        article.description.toLowerCase().includes(query)
      );
    }

    // Filter valid articles
    const validArticles = allArticles.filter(article =>
      article.title &&
      article.description &&
      !article.title.includes('[Removed]') &&
      !article.description.includes('[Removed]')
    );

    if (validArticles.length > 0) {
      displayNews(validArticles);
      displayTrendingTopics(validArticles.slice(0, 5));
    } else {
      displayNoNewsMessage();
    }
  } catch (error) {
    console.error('Error processing news:', error);
    displayErrorMessage();
  }
}

function displayNews(articles) {
  // Display featured article
  const featuredArticle = articles[0];
  document.getElementById('featuredNews').innerHTML = `
    <img src="${featuredArticle.image_url}" class="card-img-top" alt="${featuredArticle.title}" 
         onerror="this.src='/api/placeholder/800/400'">
    <div class="card-body">
        <span class="badge bg-primary mb-2">Featured</span>
        <h2 class="card-title">${featuredArticle.title}</h2>
        <p class="card-text">${featuredArticle.description}</p>
        <div class="d-flex justify-content-between align-items-center">
            <span class="source-badge">
                <i class="fas fa-newspaper me-1"></i>
                ${featuredArticle.source}
            </span>
            <div>
                <small class="text-muted me-3">
                    ${new Date(featuredArticle.published_at).toLocaleDateString()}
                </small>
                <a href="${featuredArticle.url}" target="_blank" class="btn btn-primary">Read More</a>
            </div>
        </div>
    </div>
  `;

  // Display news grid
  const newsGrid = document.getElementById('newsGrid');
  newsGrid.innerHTML = articles.slice(1, 7)
    .map(article => `
      <div class="col-md-6">
          <div class="news-card card">
              <img src="${article.image_url}" class="card-img-top" alt="${article.title}"
                   onerror="this.src='/api/placeholder/400/200'">
              <div class="card-body">
                  <h5 class="card-title">${article.title}</h5>
                  <p class="card-text">${article.description?.substring(0, 100)}...</p>
                  <div class="d-flex justify-content-between align-items-center">
                      <span class="source-badge">
                          <i class="fas fa-newspaper me-1"></i>
                          ${article.source}
                      </span>
                      <div>
                          <small class="text-muted me-3">
                              ${new Date(article.published_at).toLocaleDateString()}
                          </small>
                          <a href="${article.url}" target="_blank" class="btn btn-outline-primary btn-sm">Read More</a>
                      </div>
                  </div>
              </div>
          </div>
      </div>
    `).join('');
}

function displayTrendingTopics(articles) {
  const trendingTopics = document.getElementById('trendingTopics');
  trendingTopics.innerHTML = articles
    .map(article => `
      <div class="d-flex align-items-center mb-3">
          <img src="${article.image_url}" class="rounded" width="50" height="50" alt="${article.title}"
               onerror="this.src='/api/placeholder/50/50'">
          <div class="ms-3">
              <a href="${article.url}" target="_blank" class="text-decoration-none text-dark">
                  <h6 class="mb-0">${article.title.substring(0, 60)}...</h6>
              </a>
              <small class="text-muted">
                  ${article.source} • ${new Date(article.published_at).toLocaleDateString()}
              </small>
          </div>
      </div>
    `).join('');
}

function displayNoNewsMessage() {
  document.getElementById('featuredNews').innerHTML = `
    <div class="card-body text-center">
        <h3>No Recent News Available</h3>
        <p>We couldn't find any recent news from India. Please try again later.</p>
    </div>
  `;
  document.getElementById('newsGrid').innerHTML = '';
  document.getElementById('trendingTopics').innerHTML = '';
}

function displayErrorMessage() {
  document.getElementById('featuredNews').innerHTML = `
    <div class="card-body text-center">
        <h3>Error Loading News</h3>
        <p>There was an error loading the latest news. Please try again later.</p>
    </div>
  `;
}

function searchNews() {
  const searchQuery = document.getElementById('searchInput').value;
  if (searchQuery.trim()) {
    fetchNews(searchQuery);
  }
}

// Initial load
fetchNews();