from backend.main import sanitize_business_phone, sanitize_business_url


def test_sanitize_business_url_ignores_social_links():
    assert sanitize_business_url("https://instagram.com/petcanilbichomimado") == ""
    assert sanitize_business_url("https://www.facebook.com/petcanil") == ""
    assert sanitize_business_url("https://www.petbichomimado.com.br") == "https://www.petbichomimado.com.br"


def test_sanitize_business_phone_removes_noise_prefixes():
    assert sanitize_business_phone("î° (46) 3224-8585") == "(46) 3224-8585"
    assert sanitize_business_phone("Dr. Dalton Capelett | Dentista em Pato Branco 5,0(90) Dentista") == "(90)"
