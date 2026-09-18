from backend.main import sanitize_business_phone, sanitize_business_url, sanitize_instagram_url


def test_sanitize_business_url_ignores_social_links():
    assert sanitize_business_url("https://instagram.com/petcanilbichomimado") == ""
    assert sanitize_business_url("https://www.facebook.com/petcanil") == ""
    assert sanitize_business_url("https://www.petbichomimado.com.br") == "https://www.petbichomimado.com.br"


def test_sanitize_google_redirect_reveals_real_destination():
    google_link = "https://www.google.com/url?q=https%3A%2F%2Fmovefitness.com.br%2F&sa=U"
    assert sanitize_business_url(google_link) == "https://movefitness.com.br/"
    assert sanitize_instagram_url("https://www.google.com/url?q=https%3A%2F%2Finstagram.com%2Fmovefitness") == "https://instagram.com/movefitness"


def test_sanitize_business_phone_removes_noise_prefixes():
    assert sanitize_business_phone("î° (46) 3224-8585") == "(46) 3224-8585"
    assert sanitize_business_phone("Dr. Dalton Capelett | Dentista em Pato Branco 5,0(90) Dentista") == "(90)"
