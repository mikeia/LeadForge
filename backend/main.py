from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from playwright.async_api import async_playwright
import asyncio
import re
from typing import List, Optional

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
    google_reviews: int = 0
    rating: Optional[float] = None
    nicho: str
    bairro: Optional[str] = None
    cidade: str
    estado: str

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
        print(f"🔍 Buscando: {search_query}")

        try:
            response = await page.goto(url, wait_until='domcontentloaded', timeout=60000)
            if response and response.status >= 400:
                print(f"⚠️ Google Maps retornou status {response.status} para {url}")
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
                        nome_el = await item.query_selector('div.fontHeadlineSmall')
                        nome = await nome_el.inner_text() if nome_el else ''
                        if not nome or nome in [r['negocio'] for r in results]:
                            continue

                        endereco = ''
                        endereco_el = await item.query_selector('div[aria-label*="Endereço"], div[aria-label*="Address"]')
                        if endereco_el:
                            endereco = await endereco_el.get_attribute('aria-label') or ''

                        telefone = ''
                        tel_el = await item.query_selector('div[aria-label*="Telefone"], div[aria-label*="Phone"]')
                        if tel_el:
                            telefone = await tel_el.get_attribute('aria-label') or ''

                        website = ''
                        site_el = await item.query_selector('div[aria-label*="Site"], div[aria-label*="Website"]')
                        if site_el:
                            website = await site_el.get_attribute('aria-label') or ''

                        rating = None
                        google_reviews = 0
                        rating_el = await item.query_selector('span[aria-label*="estrelas"], span[aria-label*="stars"]')
                        if rating_el:
                            rating_text = await rating_el.get_attribute('aria-label') or ''
                            rating_match = re.search(r'(\d+[,.]?\d*)', rating_text.replace(',', '.'))
                            if rating_match:
                                rating = float(rating_match.group(1))

                        reviews_el = await item.query_selector('span[aria-label*="avaliações"], span[aria-label*="reviews"]')
                        if reviews_el:
                            reviews_text = await reviews_el.get_attribute('aria-label') or ''
                            reviews_match = re.search(r'(\d+)', reviews_text)
                            if reviews_match:
                                google_reviews = int(reviews_match.group(1))

                        results.append({
                            'negocio': nome,
                            'endereco': endereco,
                            'telefone': telefone,
                            'website': website,
                            'google_reviews': google_reviews,
                            'rating': rating,
                            'nicho': query,
                            'bairro': '',
                            'cidade': cidade,
                            'estado': estado,
                        })
                    except Exception as e:
                        print(f"⚠️ Erro ao extrair item: {e}")
                        continue

                await page.mouse.wheel(0, 1000)
                await page.wait_for_timeout(2000)
                scroll_attempts += 1

            print(f"✅ Scraping concluído! {len(results)} resultados encontrados.")
            return results
        except Exception as e:
            print(f"❌ Erro de scraping: {e}")
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
    print("🚀 Iniciando LeadForge Scraper API...")
    print("📍 API disponível em: http://localhost:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)
