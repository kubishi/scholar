import undetected_chromedriver as uc

sites = [
    "https://dl.acm.org/doi/proceedings/10.1145/3607890",
    "https://dlnext.acm.org/doi/10.1145/947380",
    "https://dl.acm.org/doi/proceedings/10.1145/3637528",
    "https://dl.acm.org/doi/proceedings/10.1145/3626772",
    "https://dl.acm.org/doi/proceedings/10.1145/3470496",
    "https://dl.acm.org/doi/proceedings/10.1145/211782",
    "https://dl.acm.org/doi/proceedings/10.1145/1456396",
    "https://dl.acm.org/doi/proceedings/10.1145/3696348",
    "https://dl.acm.org/doi/10.1145/1639950.1639974",
    "https://dl.acm.org/doi/proceedings/10.1145/3696410",
    "https://www.mswimconf.com/",
    "https://dl.acm.org/doi/proceedings/10.1145/3629526",
    "https://aisnet.org/page/Conferences",
]

def main():
    # Just create options, but do not set binary_location
    options = uc.ChromeOptions()
    # You can add args if needed:
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    # Avoid headless for now
    
    driver = uc.Chrome(options=options)

    for site in sites:
        try:
            driver.get(site)
            print(f"Loaded: {site}")
        except Exception as e:
            print(f"Error: {site} -> {e}")

    driver.quit()

if __name__ == "__main__":
    main()