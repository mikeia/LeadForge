import os
import sys
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

os.environ.setdefault(
    'PLAYWRIGHT_BROWSERS_PATH',
    str(Path(__file__).resolve().parent.parent / '.playwright-browsers'),
)

from pydantic import BaseModel
from playwright.async_api import async_playwright
import asyncio
import re
from typing import List, Optional
from urllib.parse import parse_qs, unquote, urljoin, urlparse

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

app = FastAPI(title="LeadForge Scraper API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class SearchRequest(BaseModel):
    query: str
    cidade: str
    estado: str
    max_results: Optional[int] = 20

class LeadResult(BaseModel):
    negocio: str
    endereco: Optional[str] = None
    telefone: Optional[str] = None
    website: Optional[str] = None
    instagram: Optional[str] = None
    google_url: Optional[str] = None
    google_reviews: int = 0
    rating: Optional[float] = None
    nicho: str
    bairro: Optional[str] = None
    cidade: str
    estado: str


def normalize_text(value: Optional[str]) -> str:
    if not value:
        return ''
    cleaned = str(value)
    cleaned = cleaned.replace('\u00ee', '').replace('î', '').replace('°', '')
    cleaned = cleaned.replace('\n', ' ')
    cleaned = re.sub(r'\s+', ' ', cleaned)
    cleaned = cleaned.strip(' -|:;,.')
    return cleaned


def sanitize_business_phone(value: Optional[str]) -> str:
    text = normalize_text(value)
    if not text:
        return ''

    candidates = re.findall(
        r'(?:\+?\d{2}\s*)?(?:\(\d{2}\)|\d{2})\s*(?:\d{4,5}[\s.-]?\d{4})',
        text,
    )
    if candidates:
        candidate = normalize_text(candidates[0])
        if len(re.sub(r'\D', '', candidate)) >= 10:
            return candidate

    digits = re.sub(r'\D', '', text)
    if len(digits) >= 10:
        match = re.search(r'(?:\+?\d{2}\s*)?(?:\(\d{2}\)|\d{2})\s*(?:\d{4,5}[\s.-]?\d{4})', text)
        if match:
            return normalize_text(match.group(0))

    return ''


def unwrap_google_url(value: Optional[str]) -> str:
    text = normalize_text(value)
    if not text:
        return ''

    if text.startswith(('http://', 'https://')):
        parsed = urlparse(text)
        host = parsed.netloc.lower()
        if 'google.' in host or host.startswith('www.google.'):
            params = parse_qs(parsed.query)
            for key in ('q', 'url', 'u'):
                target = params.get(key, [''])[0]
                if target.startswith(('http://', 'https://')):
                    return unquote(target)
    return text


def sanitize_business_url(value: Optional[str]) -> str:
    text = unwrap_google_url(value)
    if not text:
        return ''

    lower = text.lower().strip().rstrip('.,;')
    if lower.startswith('http://') or lower.startswith('https://'):
        candidate = lower
    elif '://' not in lower and '.' in lower and ' ' not in lower:
        candidate = f'https://{lower}'
    else:
        return ''

    if any(token in candidate for token in [
        'instagram.com', 'facebook.com', 'wa.me', 'whatsapp.com', 'x.com',
        'twitter.com', 'tiktok.com', 'linkedin.com', 'youtube.com',
        'maps.google', 'google.com', 'googleusercontent.com', 'g.page'
    ]):
        return ''

    if '://' not in candidate:
        return ''

    domain = candidate.split('://', 1)[1].split('/', 1)[0].split('?')[0]
    if not domain or '.' not in domain:
        return ''

    return candidate


def is_social_url(value: Optional[str]) -> bool:
    text = normalize_text(value).lower()
    return any(token in text for token in [
        'instagram.com', 'facebook.com', 'wa.me', 'whatsapp.com', 'x.com',
        'twitter.com', 'tiktok.com', 'linkedin.com', 'youtube.com',
        'maps.google', 'google.com', 'googleusercontent.com', 'g.page'
    ])


def sanitize_instagram_url(value: Optional[str]) -> str:
    text = unwrap_google_url(value)
    if 'instagram.com' not in text.lower():
        return ''
    if not text.lower().startswith(('http://', 'https://')):
        text = f'https://{text}'
    return text.rstrip('.,;')


def sanitize_business_name(value: Optional[str]) -> str:
    text = normalize_text(value)
    if not text:
        return ''

    text = re.sub(r'\s*\|\s*.*$', '', text)
    text = re.sub(r'\s*\d{1,2},\d+\s*\(\d+\)\s*.*$', '', text)
    text = re.sub(r'\s*\(\d+\)\s*.*$', '', text)
    return normalize_text(text)


def sanitize_business_address(value: Optional[str]) -> str:
    text = normalize_text(value)
    if not text:
        return ''

    text = re.sub(r'\s*\|\s*.*$', '', text)
    text = re.sub(r'\s*\d{1,2},\d+\s*\(\d+\)\s*.*$', '', text)
    return normalize_text(text)


async def extract_text_from_selectors(item, selectors: List[str]) -> str:
    for selector in selectors:
        try:
            el = await item.query_selector(selector)
            if not el:
                continue
            text = normalize_text(await el.inner_text())
            if text:
                return text
        except Exception:
            continue
    return ''


async def read_detail_panel(page):
    detail = {}
    selectors = {
        'endereco': [
            '[data-item-id="address"]',
            'button[aria-label*="Endereço"]',
            'button[aria-label*="Address"]',
            'div[aria-label*="Endereço"]',
            'div[aria-label*="Address"]',
            'span[aria-label*="Endereço"]',
            'span[aria-label*="Address"]',
        ],
        'telefone': [
            '[data-item-id="phone"]',
            'button[aria-label*="Telefone"]',
            'button[aria-label*="Phone"]',
            'button[aria-label*="Ligar"]',
            'button[aria-label*="Call"]',
            '[data-item-id^="phone:"]',
            'div[aria-label*="Telefone"]',
            'div[aria-label*="Phone"]',
            'a[href^="tel:"]',
        ],
        'rating': [
            'span[aria-label*="estrelas"]',
            'span[aria-label*="stars"]',
            'span[aria-label*="avaliações"]',
            'span[aria-label*="reviews"]',
        ],
    }

    for key, values in selectors.items():
        for selector in values:
            try:
                locator = page.locator(selector).first
                if await locator.count() == 0:
                    continue
                text = normalize_text(await locator.inner_text())
                if not text:
                    text = normalize_text(await locator.get_attribute('aria-label'))
                if not text:
                    href = await locator.get_attribute('href') or ''
                    if href.startswith('tel:'):
                        text = href.removeprefix('tel:')
                if text and text.lower() not in {'null', 'none', 'undefined'}:
                    detail[key] = text
                    break
            except Exception:
                continue

    try:
        authority = page.locator('[data-item-id="authority"]').first
        if await authority.count() > 0:
            website = sanitize_business_url(await authority.get_attribute('href'))
            if website:
                detail['website'] = website

        instagram_link = page.locator('a[href*="instagram.com"]').first
        if await instagram_link.count() > 0:
            instagram = sanitize_instagram_url(await instagram_link.get_attribute('href'))
            if instagram:
                detail['instagram'] = instagram
    except Exception:
        pass

    if detail.get('rating'):
        match = re.search(r'(\d+[,.]?\d*)', detail['rating'].replace(',', '.'))
        if match:
            detail['rating_value'] = float(match.group(1))
        reviews_match = re.search(r'(\d+)\s*(?:avaliações|reviews)', detail['rating'], re.IGNORECASE)
        if reviews_match:
            detail['google_reviews'] = int(reviews_match.group(1))

    return detail


async def find_bio_website(context, instagram_url: str) -> str:
    if not instagram_url:
        return ''
    profile_page = await context.new_page()
    try:
        await profile_page.goto(instagram_url, wait_until='domcontentloaded', timeout=15000)
        await profile_page.wait_for_timeout(1200)
        links = await profile_page.locator('a[href]').all()
        for link in links:
            href = await link.get_attribute('href') or ''
            if not href.startswith(('http://', 'https://')) or is_social_url(href):
                continue
            final_url = href
            if any(shortener in href.lower() for shortener in ['bit.ly', 'tinyurl.com', 't.co', 'cutt.ly', 'goo.gl']):
                try:
                    await profile_page.goto(href, wait_until='domcontentloaded', timeout=10000)
                    final_url = profile_page.url
                except Exception:
                    pass
            website = sanitize_business_url(final_url)
            if website:
                return website
    except Exception:
        return ''
    finally:
        await profile_page.close()
    return ''


async def extract_card_data(item, page, query: str, cidade: str, estado: str):
    card_text = normalize_text(await item.inner_text())
    google_url = ''
    place_link = None

    try:
        links = await item.query_selector_all('a[href]')
        for link in links:
            href = await link.get_attribute('href') or ''
            absolute_href = urljoin(page.url, href)
            if '/maps/' in absolute_href.lower() or 'google.com/maps' in absolute_href.lower():
                google_url = absolute_href
                place_link = link
                break
    except Exception:
        pass

    name = await extract_text_from_selectors(item, [
        'div.fontHeadlineSmall',
        'h2',
        'h3',
        'div[role="heading"]',
        '[data-result-id]',
        'span[title]',
    ])
    if not name:
        name = card_text.split('·')[0].strip() if card_text else ''

    address = await extract_text_from_selectors(item, [
        '[data-item-id="address"]',
        'div[aria-label*="Endereço"]',
        'div[aria-label*="Address"]',
        'button[aria-label*="Endereço"]',
        'button[aria-label*="Address"]',
    ])
    if not address:
        for line in card_text.split('·'):
            candidate = normalize_text(line)
            if not candidate:
                continue
            lower = candidate.lower()
            if any(token in lower for token in ['rua', 'avenida', 'av.', 'av ', 'travessa', 'alameda', 'praça', 'bairro', 'centro', 'pato branco']):
                address = candidate
                break

    phone = await extract_text_from_selectors(item, [
        'div[aria-label*="Telefone"]',
        'div[aria-label*="Phone"]',
        'button[aria-label*="Telefone"]',
        'button[aria-label*="Phone"]',
        'a[aria-label*="Telefone"]',
        'a[aria-label*="Phone"]',
    ])
    if not phone:
        phone_matches = re.findall(r'(?:(?:\+?\d{2})\s*(?:\(?\d{2}\)?\s*)?(?:\d{4,5}[\s.-]?\d{4}))', card_text)
        if phone_matches:
            phone = phone_matches[0]

    website = await extract_text_from_selectors(item, [
        'a[href*="http"]',
        'a[href*="www."]',
        'div[aria-label*="Site"]',
        'div[aria-label*="Website"]',
    ])
    if not website:
        href_candidates = []
        try:
            links = await item.query_selector_all('a[href]')
            for link in links:
                try:
                    href = await link.get_attribute('href') or ''
                    if href and 'google' not in href.lower() and 'maps.google' not in href.lower() and 'javascript:' not in href.lower():
                        href_candidates.append(href)
                except Exception:
                    continue
            if href_candidates:
                website = href_candidates[0]
        except Exception:
            website = ''
    if not website:
        website_match = re.search(r'https?://[^\s]+|www\.[^\s]+', card_text)
        if website_match:
            website = website_match.group(0)

    instagram = sanitize_instagram_url(website)
    website = sanitize_business_url(website)
    if instagram:
        website = ''

    try:
        links = await item.query_selector_all('a[href]')
        for link in links:
            href = await link.get_attribute('href') or ''
            if not href.startswith(('http://', 'https://')):
                continue
            if not instagram:
                instagram = sanitize_instagram_url(href)
            if not website:
                website = sanitize_business_url(href)
    except Exception:
        pass

    rating = None
    google_reviews = 0
    rating_el = await extract_text_from_selectors(item, [
        'span[aria-label*="estrelas"]',
        'span[aria-label*="stars"]',
        'span[aria-label*="avaliações"]',
        'span[aria-label*="reviews"]',
    ])
    if rating_el:
        rating_match = re.search(r'(\d+[,.]?\d*)', rating_el.replace(',', '.'))
        if rating_match:
            try:
                rating = float(rating_match.group(1))
            except ValueError:
                rating = None
        reviews_match = re.search(r'(\d+)\s*(?:avaliações|reviews)', rating_el, re.IGNORECASE)
        if reviews_match:
            google_reviews = int(reviews_match.group(1))
    if rating is None:
        rating_match = re.search(r'(\d+[,.]?\d*)\s*(?:estrela|star)', card_text, re.IGNORECASE)
        if rating_match:
            try:
                rating = float(rating_match.group(1).replace(',', '.'))
            except ValueError:
                rating = None
    if google_reviews == 0:
        reviews_match = re.search(r'(\d+)\s*(?:avaliações|reviews)', card_text, re.IGNORECASE)
        if reviews_match:
            google_reviews = int(reviews_match.group(1))

    if not address or not phone or not website or rating is None:
        try:
            previous_heading = ''
            try:
                heading_before = page.locator('h1').first
                if await heading_before.count() > 0:
                    previous_heading = normalize_text(await heading_before.inner_text())
            except Exception:
                previous_heading = ''

            click_target = place_link or item
            await click_target.scroll_into_view_if_needed()
            await click_target.click()

            try:
                await page.wait_for_function(
                    """(prev) => {
                        const h1 = document.querySelector('h1');
                        const text = h1 && h1.innerText ? h1.innerText.trim() : '';
                        return text !== '' && text !== prev;
                    }""",
                    arg=previous_heading,
                    timeout=8000,
                )
            except Exception:
                pass

            detail = await read_detail_panel(page)
            if '/maps/place/' in page.url:
                google_url = page.url
            if not address and detail.get('endereco'):
                address = detail['endereco']
            if not phone and detail.get('telefone'):
                phone = detail['telefone']
            if not website and detail.get('website'):
                website = detail['website']
            if not instagram and detail.get('instagram'):
                instagram = detail['instagram']
            if not website and instagram:
                website = await find_bio_website(page.context, instagram)
            if rating is None and detail.get('rating_value') is not None:
                rating = detail['rating_value']
            if google_reviews == 0 and detail.get('google_reviews'):
                google_reviews = detail['google_reviews']

            try:
                back_button = page.locator('button[aria-label*="Voltar"], button[aria-label*="Back"]').first
                if await back_button.count() > 0:
                    await back_button.click()
                else:
                    await page.go_back()
                await page.wait_for_selector('div[role="article"]', timeout=8000)
            except Exception:
                pass
        except Exception:
            pass

    business_name = sanitize_business_name(name)
    clean_address = sanitize_business_address(address)
    clean_phone = sanitize_business_phone(phone)
    clean_url = sanitize_business_url(website)

    if not clean_url and clean_phone and business_name and clean_address:
        pass

    return {
        'negocio': business_name or 'Não informado',
        'endereco': clean_address or '',
        'telefone': clean_phone or '',
        'website': clean_url or '',
        'instagram': instagram or '',
        'google_url': google_url,
        'google_reviews': google_reviews,
        'rating': rating,
        'nicho': query,
        'bairro': '',
        'cidade': cidade,
        'estado': estado,
    }


async def scrape_google_maps(query: str, cidade: str, estado: str, max_results: int = 20) -> List[dict]:
    results = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                '--ignore-certificate-errors',
                '--disable-blink-features=AutomationControlled',
                '--disable-features=IsolateOrigins,site-per-process'
            ]
        )
        context = await browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            ignore_https_errors=True,
            java_script_enabled=True,
        )
        page = await context.new_page()
        search_query = f"{query} em {cidade} {estado}"
        url = f"https://www.google.com/maps/search/{search_query.replace(' ', '+')}"
        print(f"Buscando: {search_query}")

        try:
            response = await page.goto(url, wait_until='domcontentloaded', timeout=60000)
            if response and response.status >= 400:
                print(f"Google Maps retornou status {response.status} para {url}")
                return []
            await page.wait_for_timeout(5000)

            scroll_attempts = 0
            max_scrolls = 10

            while len(results) < max_results and scroll_attempts < max_scrolls:
                items = await page.query_selector_all('div[role="article"]')

                for item in items:
                    if len(results) >= max_results:
                        break
                    try:
                        card_data = await extract_card_data(item, page, query, cidade, estado)
                        nome = card_data['negocio']
                        if not nome or nome == 'Não informado' or nome in [r['negocio'] for r in results]:
                            continue

                        results.append(card_data)
                    except Exception as e:
                        print(f"Erro ao extrair item: {e}")
                        continue

                await page.mouse.wheel(0, 1000)
                await page.wait_for_timeout(2000)
                scroll_attempts += 1

            print(f"Scraping concluído! {len(results)} resultados encontrados.")
            return results
        except Exception as e:
            print(f"Erro de scraping: {e}")
            return []
        finally:
            await browser.close()

@app.get("/")
async def root():
    return {
        "message": "LeadForge Scraper API",
        "status": "online",
        "endpoints": {
            "/scrape": "POST - Faz scraping do Google Maps",
            "/health": "GET - Health check"
        }
    }

@app.post("/scrape", response_model=List[LeadResult])
async def scrape_leads(request: SearchRequest):
    try:
        return await scrape_google_maps(
            query=request.query,
            cidade=request.cidade,
            estado=request.estado,
            max_results=request.max_results or 20,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    print("Iniciando LeadForge Scraper API...")
    print("API disponível em: http://localhost:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)
