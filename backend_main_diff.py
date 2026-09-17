--- backend/main.py (原始)


+++ backend/main.py (修改后)
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from playwright.async_api import async_playwright
import asyncio
import re
from typing import List, Optional
import json

app = FastAPI(title="LeadForge Scraper API")

# CORS para permitir requisições do frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Em produção, especifique o domínio
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
    """
    Faz scraping do Google Maps usando Playwright
    """
    results = []

    async with async_playwright() as p:
        # Lança o navegador (headless=True para não abrir a janela)
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        )
        page = await context.new_page()

        # Constrói a URL de busca
        search_query = f"{query} em {cidade} {estado}"
        url = f"https://www.google.com/maps/search/{search_query.replace(' ', '+')}"

        print(f"🔍 Buscando: {search_query}")

        try:
            # Navega para o Google Maps
            await page.goto(url, wait_until='networkidle', timeout=30000)
            await page.wait_for_timeout(3000)  # Espera carregar

            # Faz scroll para carregar mais resultados
            scroll_attempts = 0
            max_scrolls = 10

            while len(results) < max_results and scroll_attempts < max_scrolls:
                # Extrai resultados visíveis
                items = await page.query_selector_all('div[role="article"]')

                for item in items:
                    if len(results) >= max_results:
                        break

                    try:
                        # Nome do negócio
                        nome_el = await item.query_selector('div.fontHeadlineSmall')
                        nome = await nome_el.inner_text() if nome_el else ''

                        if not nome or nome in [r['negocio'] for r in results]:
                            continue

                        # Endereço
                        endereco = ''
                        endereco_el = await item.query_selector('div[aria-label*="Endereço"], div[aria-label*="Address"]')
                        if endereco_el:
                            endereco = await endereco_el.get_attribute('aria-label') or ''

                        # Telefone
                        telefone = ''
                        tel_el = await item.query_selector('div[aria-label*="Telefone"], div[aria-label*="Phone"]')
                        if tel_el:
                            telefone = await tel_el.get_attribute('aria-label') or ''

                        # Website
                        website = ''
                        site_el = await item.query_selector('div[aria-label*="Site"], div[aria-label*="Website"]')
                        if site_el:
                            website = await site_el.get_attribute('aria-label') or ''

                        # Rating e reviews
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

                        # Extrai bairro do endereço
                        bairro = extrair_bairro(endereco)

                        results.append({
                            'negocio': nome,
                            'endereco': endereco,
                            'telefone': telefone,
                            'website': website,
                            'google_reviews': google_reviews,
                            'rating': rating,
                            'nicho': query,
                            'bairro': bairro,
                            'cidade': cidade,
                            'estado': estado
                        })

                    except Exception as e:
                        print(f"⚠️ Erro ao extrair item: {e}")
                        continue

                # Scroll para carregar mais
                await page.mouse.wheel(0, 1000)
                await page.wait_for_timeout(2000)
                scroll_attempts += 1

                print(f"📊 Encontrou {len(results)} resultados até agora...")

        except Exception as e:
            print(f"❌ Erro durante o scraping: {e}")
            raise HTTPException(status_code=500, detail=f"Erro no scraping: {str(e)}")

        finally:
            await browser.close()

    print(f"✅ Scraping concluído! {len(results)} resultados encontrados.")
    return results

def extrair_bairro(endereco: str) -> str:
    """
    Tenta extrair o bairro do endereço
    """
    bairros_conhecidos = [
        'Centro', 'São Cristóvão', 'Novo Horizonte', 'Pinheirinho',
        'Banco Real', 'Centauro', 'Industrial', 'Samdnei',
        'Planalto', 'Alvorada', 'Jardim Floresta', 'Village',
        'Parque do Pinheiro', 'Cristo Rei', 'Bom Jesus'
    ]

    endereco_lower = endereco.lower()
    for bairro in bairros_conhecidos:
        if bairro.lower() in endereco_lower:
            return bairro

    # Se não encontrar, retorna vazio
    return ''

@app.get("/")
async def root():
    return {
        "message": "LeadForge Scraper API",
        "status": "online",
        "endpoints": {
            "/scrape": "POST - Faz scraping do Google Maps"
        }
    }

@app.post("/scrape", response_model=List[LeadResult])
async def scrape_leads(request: SearchRequest):
    """
    Endpoint para fazer scraping do Google Maps
    """
    try:
        results = await scrape_google_maps(
            query=request.query,
            cidade=request.cidade,
            estado=request.estado,
            max_results=request.max_results
        )
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    print("🚀 Iniciando LeadForge Scraper API...")
    print("📍 API disponível em: http://localhost:8000")
    print("📚 Documentação em: http://localhost:8000/docs")
    uvicorn.run(app, host="0.0.0.0", port=8000)
