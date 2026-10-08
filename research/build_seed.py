"""Builds data/seed.json from the research notes.

Every company is backed by at least one listing source that places it in Gurugram
(Inc42's Gurugram lists, Wikipedia, or news). Companies with a verified office
address (research/addresses.tsv: GST registration, company registry, or the
company's own site) get an area-level pin at their sector. Everyone else is listed
without a pin. Street addresses are never published, only the sector.
"""
import csv, json, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
TODAY = "2026-10-08"

L = {
    "top": "https://inc42.com/lists/top-30-funded-startups-in-gurugram-2026/",
    "all": "https://inc42.com/lists/list-of-startups-in-gurugram/",
    "fin": "https://inc42.com/lists/top-30-funded-fintech-startups-in-gurugram-2026/",
    "edu": "https://inc42.com/lists/top-30-funded-edtech-startups-in-gurugram-2026/",
    "ai": "https://inc42.com/lists/top-10-funded-ai-startups-in-gurugram-2026/",
    "health": "https://inc42.com/lists/top-30-funded-healthtech-startups-in-gurugram-2026/",
    "ecom": "https://inc42.com/lists/top-30-funded-ecommerce-d2c-startups-in-gurugram-2026/",
    "ent": "https://inc42.com/lists/enterprise-tech-startups-in-gurugram/",
    "seed": "https://seedtable.com/best-startups-in-gurgaon",
}
NOTE = {
    "top": "Inc42: top funded startups in Gurugram",
    "all": "Inc42: list of startups in Gurugram",
    "fin": "Inc42: top funded fintech startups in Gurugram",
    "edu": "Inc42: top funded edtech startups in Gurugram",
    "ai": "Inc42: top funded AI startups in Gurugram",
    "health": "Inc42: top funded healthtech startups in Gurugram",
    "ecom": "Inc42: top funded ecommerce startups in Gurugram",
    "ent": "Inc42: enterprise tech startups in Gurugram",
    "seed": "Seedtable: best startups in Gurugram",
}

# slug -> area slug, from the verified addresses
AREA = {
    "spinny": "sohna-road", "cars24": "sector-39", "policybazaar": "sector-44",
    "eternal": "sector-62", "delhivery": "sector-44", "makemytrip": "dlf-cyber-city",
    "mobikwik": "golf-course-road-53", "ixigo": "golf-course-road-53",
    "urban-company": "udyog-vihar", "oyo": "golf-course-road-53", "bharatpe": "dlf-cyber-city",
    "greyorange": "sector-34", "ofbusiness": "mg-road", "snapdeal": "sector-59",
    "blinkit": "sector-62", "healthkart": "sector-14", "renew": "dlf-phase-5",
    "acme-solar": "sector-44", "oxyzo": "mg-road", "clix-capital": "sector-42-43",
    "vvdn": "sector-34", "payu": "sohna-road", "indmoney": "sector-65", "indifi": "sector-44",
    "renewbuy": "sector-32", "m1xchange": "udyog-vihar", "square-yards": "sector-44",
    "zupee": "udyog-vihar", "cashify": "sector-44", "magicpin": "sector-29-iffco-chowk",
    "healthians": "sector-34", "collegedekho": "sector-62", "doubtnut": "sushant-lok",
    "splashlearn": "sohna-road", "power2sme": "udyog-vihar", "stanza-living": "udyog-vihar",
    "fleetx": "sohna-road", "tata-1mg": "sector-14", "rivigo": "sector-44",
    "varaha": "udyog-vihar", "uolo": "dlf-phase-5", "filo": "sector-39",
    "pristyn-care": "sector-66",
}

# (slug, name, kind, sectors, founded, one_liner, website, list keys, status, extra)
C = "company"
ORGS = [
    # --- Large / unicorns ---
    ("eternal", "Eternal (Zomato)", C, ["food-quick-commerce", "commerce-marketplaces"], 2008, "Holding company behind Zomato food delivery, Blinkit quick commerce, Hyperpure B2B supplies and the District going-out app.", "https://www.eternal.com", ["top", "all"], "active", {}),
    ("blinkit", "Blinkit", C, ["food-quick-commerce"], 2013, "Quick-commerce app delivering groceries and essentials in minutes from dark stores. Started as Grofers; owned by Eternal.", "https://blinkit.com", ["top", "all"], "acquired", {"acquired_by": "eternal"}),
    ("makemytrip", "MakeMyTrip", C, ["travel-hospitality"], 2000, "Online travel company for flights, hotels, holiday packages, buses, trains and cabs.", "https://www.makemytrip.com", ["top", "all"], "active", {}),
    ("oyo", "OYO", C, ["travel-hospitality"], 2012, "Hospitality platform that leases, franchises and operates budget hotels and homes.", "https://www.oyorooms.com", ["top", "all", "seed"], "active", {}),
    ("lenskart", "Lenskart", C, ["commerce-marketplaces"], 2008, "Omnichannel eyewear retailer selling glasses and contact lenses online and through its own stores.", "https://www.lenskart.com", ["top", "all", "ecom"], "active", {}),
    ("snapdeal", "Snapdeal", C, ["commerce-marketplaces"], 2010, "Value-focused online marketplace for fashion, home and general merchandise.", "https://www.snapdeal.com", ["top", "all", "ecom"], "active", {}),
    ("delhivery", "Delhivery", C, ["logistics-mobility"], 2011, "Logistics network for parcel delivery, freight, warehousing and supply-chain services.", "https://www.delhivery.com", ["top", "all", "ent"], "active", {}),
    ("cars24", "Cars24", C, ["commerce-marketplaces", "logistics-mobility"], 2015, "Platform for buying and selling used cars, with inspection, financing and paperwork.", "https://www.cars24.com", ["top", "all", "ecom", "seed"], "active", {}),
    ("policybazaar", "Policybazaar", C, ["insurtech", "fintech"], 2008, "Online marketplace to compare and buy insurance; flagship business of PB Fintech.", "https://www.policybazaar.com", ["top", "all", "fin"], "active", {}),
    ("ofbusiness", "OfBusiness", C, ["commerce-marketplaces", "fintech"], 2015, "B2B platform supplying raw materials such as steel and chemicals to SMEs, with embedded credit.", "https://www.ofbusiness.com", ["top", "all", "ecom", "seed"], "active", {}),
    ("oxyzo", "Oxyzo", C, ["fintech"], 2016, "B2B lender to small and mid-sized businesses; the lending arm of OfBusiness.", "https://www.oxyzo.in", ["fin", "ent"], "active", {}),
    ("bharatpe", "BharatPe", C, ["fintech"], 2018, "Payments and lending for small merchants: UPI QR codes, card machines and business loans.", "https://www.bharatpe.com", ["top", "all", "fin"], "active", {}),
    ("spinny", "Spinny", C, ["commerce-marketplaces", "logistics-mobility"], 2015, "Full-stack used-car retailer selling inspected cars with home test drives and financing.", "https://www.spinny.com", ["top", "all", "ecom"], "active", {}),
    ("urban-company", "Urban Company", C, ["consumer-services"], 2014, "Marketplace for at-home services such as cleaning, repairs and beauty, delivered by trained professionals.", "https://www.urbancompany.com", ["top", "all", "ent", "seed"], "active", {}),
    ("aye-finance", "Aye Finance", C, ["fintech"], 2014, "Lender providing business loans to micro and small enterprises.", "https://www.ayefinance.com", ["top", "all", "fin"], "active", {}),
    ("greyorange", "GreyOrange", C, ["hardware-robotics", "logistics-mobility"], 2012, "Warehouse robotics and fulfilment-orchestration software for retailers and logistics companies.", "https://www.greyorange.com", ["top"], "active", {}),
    ("insurancedekho", "InsuranceDekho", C, ["insurtech"], 2016, "Insurance distribution platform selling motor, health and life policies online and through agents.", "https://www.insurancedekho.com", ["top", "fin"], "active", {}),
    ("healthkart", "HealthKart", C, ["commerce-marketplaces", "health-biotech"], 2011, "Online store and brand house for sports nutrition and wellness supplements.", "https://www.healthkart.com", ["top", "ecom"], "active", {}),
    ("mobikwik", "MobiKwik", C, ["fintech"], 2009, "Digital wallet and payments app, plus credit, investments and insurance.", "https://www.mobikwik.com", ["fin", "ent"], "active", {}),
    ("ixigo", "ixigo", C, ["travel-hospitality"], 2007, "Travel app to compare and book trains, flights, buses and hotels.", "https://www.ixigo.com", [], "active", {"extra_source": ("https://en.wikipedia.org/wiki/Ixigo", "Wikipedia: headquartered in Gurugram; founded June 2007")}),
    ("square-yards", "Square Yards", C, ["proptech-construction"], 2014, "Real-estate platform for buying, selling, renting and financing property, with data and agent tools.", "https://www.squareyards.com", ["seed"], "active", {}),
    ("zupee", "Zupee", C, ["gaming"], 2018, "Skill-based online gaming app built around board games like Ludo.", "https://www.zupee.com", [], "active", {"extra_source": ("https://fliarbi.com/companies/top-startups-in-gurugram/", "Fliarbi: Gurugram startups ranked by revenue")}),
    ("magicpin", "magicpin", C, ["commerce-marketplaces", "food-quick-commerce"], 2015, "Local discovery and food-ordering app with deals from neighbourhood stores and restaurants.", "https://magicpin.in", [], "active", {"extra_source": ("https://fliarbi.com/companies/top-startups-in-gurugram/", "Fliarbi: Gurugram startups ranked by revenue")}),
    ("stanza-living", "Stanza Living", C, ["proptech-construction"], 2017, "Operator of furnished, managed shared housing for students and young professionals.", "https://www.stanzaliving.com", [], "active", {"extra_source": ("https://fliarbi.com/companies/top-startups-in-gurugram/", "Fliarbi: Gurugram startups ranked by revenue")}),
    ("country-delight", "Country Delight", C, ["food-quick-commerce"], 2015, "Subscription app delivering milk, dairy and daily essentials to homes each morning.", "https://www.countrydelight.in", ["ecom"], "active", {}),
    ("citymall", "CityMall", C, ["commerce-marketplaces"], 2019, "Social commerce platform selling groceries and essentials to smaller-town shoppers via community leaders.", "https://www.citymall.live", ["ecom", "seed"], "active", {}),
    ("cashify", "Cashify", C, ["commerce-marketplaces"], 2009, "Re-commerce platform to sell, buy and repair used phones and gadgets.", "https://www.cashify.in", ["ecom"], "active", {}),
    ("droom", "Droom", C, ["commerce-marketplaces", "logistics-mobility"], 2014, "Online marketplace for buying and selling used vehicles.", "https://droom.in", ["ecom"], "active", {}),
    ("shopclues", "ShopClues", C, ["commerce-marketplaces"], 2011, "Online marketplace for value-priced products.", "https://www.shopclues.com", ["ecom"], "active", {}),
    ("power2sme", "Power2SME", C, ["commerce-marketplaces"], 2012, "B2B marketplace for industrial raw materials for small manufacturers.", "https://www.power2sme.com", ["ecom"], "active", {}),
    ("rivigo", "Rivigo", C, ["logistics-mobility"], 2014, "Tech-enabled trucking and freight logistics company.", "https://rivigo.com", [], "active", {}),
    ("vvdn", "VVDN Technologies", C, ["hardware-robotics"], None, "Electronics product engineering and manufacturing company (design, firmware and devices).", "https://www.vvdntech.com", [], "active", {}),
    # --- Cleantech ---
    ("renew", "ReNew", C, ["ev-cleantech"], 2011, "Renewable energy company developing and operating wind, solar and storage projects.", "https://www.renew.com", ["top", "all", "ent"], "active", {}),
    ("acme-solar", "ACME Solar", C, ["ev-cleantech"], 2003, "Solar and renewable power project developer.", "https://www.acmesolar.in", ["top", "all"], "active", {}),
    ("juniper-green", "Juniper Green Energy", C, ["ev-cleantech"], 2018, "Renewable energy developer working on wind and solar projects.", None, ["all"], "active", {}),
    ("serentica", "Serentica Renewables", C, ["ev-cleantech"], 2022, "Renewable energy company building clean power for industrial customers.", None, ["all"], "active", {}),
    ("blupine", "BluPine Energy", C, ["ev-cleantech"], 2021, "Renewable energy platform.", None, ["all"], "active", {}),
    ("o2-power", "O2 Power", C, ["ev-cleantech"], 2019, "Clean energy company.", None, ["all"], "active", {}),
    ("statiq", "Statiq", C, ["ev-cleantech"], None, "Electric-vehicle charging network.", "https://www.statiq.in", ["seed"], "active", {}),
    ("battery-smart", "Battery Smart", C, ["ev-cleantech", "logistics-mobility"], None, "Battery-swapping network for electric two- and three-wheelers.", "https://www.batterysmart.in", ["seed"], "active", {}),
    ("batx-energies", "BatX Energies", C, ["ev-cleantech"], None, "Lithium-ion battery recycling and materials recovery.", None, ["seed"], "active", {}),
    ("varaha", "Varaha", C, ["agri-climate"], None, "Carbon-removal projects with farmers, such as regenerative agriculture and biochar.", None, ["seed"], "active", {}),
    ("zenergize", "Zenergize", C, ["ev-cleantech"], None, None, None, [], "active", {"extra_source": ("https://www.ipoplatform.com/Funding-news/zenergize-raises-funding", "News: Gurugram startup Zenergize raises $4M")}),
    # --- Fintech ---
    ("clix-capital", "Clix Capital", C, ["fintech"], 2016, "Lending platform for consumers and small businesses.", "https://www.clix.capital", ["fin"], "active", {}),
    ("freecharge", "FreeCharge", C, ["fintech"], 2010, "Payments app for UPI, recharges and bill payments.", "https://www.freecharge.in", ["fin"], "active", {}),
    ("true-balance", "True Balance", C, ["fintech"], 2014, "Digital lending app offering small personal loans.", None, ["fin"], "active", {}),
    ("renewbuy", "RenewBuy", C, ["insurtech"], 2015, "Insurance distribution platform that equips agents to sell policies digitally.", "https://www.renewbuy.com", ["fin"], "active", {}),
    ("indmoney", "INDmoney", C, ["fintech"], 2019, "Investing and personal-finance app for Indian and US stocks, mutual funds and more.", "https://www.indmoney.com", ["fin"], "active", {}),
    ("indifi", "Indifi Technologies", C, ["fintech"], 2015, "Online lending platform for small businesses.", "https://www.indifi.com", ["fin", "seed"], "active", {}),
    ("payu", "PayU India", C, ["fintech"], 2011, "Online payments processing for businesses, plus consumer credit.", "https://payu.in", ["fin"], "active", {}),
    ("triotech", "Triotech", C, ["fintech"], 2009, None, None, ["fin"], "active", {}),
    ("fincfriends", "FincFriends", C, ["fintech"], 2017, None, None, ["fin"], "active", {}),
    ("strideone", "StrideOne", C, ["fintech"], 2021, "Supply-chain financing for businesses.", None, ["fin"], "active", {}),
    ("m1xchange", "M1xchange", C, ["fintech"], 2016, "Invoice-discounting (TReDS) exchange for MSME receivables.", "https://www.m1xchange.com", ["fin"], "active", {}),
    ("univest", "Univest", C, ["fintech"], 2022, None, None, ["fin"], "active", {}),
    ("credenc", "Credenc", C, ["fintech"], 2017, None, None, ["fin"], "active", {}),
    ("indiagold", "IndiaGold", C, ["fintech"], 2020, "Digital gold-loan business.", None, ["fin"], "active", {}),
    ("basic-home-loan", "BASIC Home Loan", C, ["fintech", "proptech-construction"], 2020, None, None, ["fin"], "active", {}),
    ("seeds-fincap", "Seeds Fincap", C, ["fintech"], 2019, None, None, ["fin", "seed"], "active", {}),
    ("indialends", "IndiaLends", C, ["fintech"], 2014, None, None, ["fin"], "active", {}),
    ("ambak", "Ambak", C, ["fintech", "proptech-construction"], 2023, None, None, ["fin"], "active", {}),
    ("centricity", "Centricity", C, ["fintech"], 2022, "Digital private-wealth platform.", None, ["seed"], "active", {}),
    ("salaryse", "SalarySe", C, ["fintech"], None, None, None, ["seed"], "active", {}),
    # --- Edtech ---
    ("fstc", "FSTC", C, ["edtech"], 2012, "Flight simulation and aviation training.", None, ["top", "all", "edu"], "active", {}),
    ("collegedekho", "CollegeDekho", C, ["edtech"], 2015, "College discovery and admissions guidance platform for students.", "https://www.collegedekho.com", ["edu"], "active", {"funding": "$106M"}),
    ("sunstone", "Sunstone", C, ["edtech"], 2014, "Higher-education company running degree programmes with partner universities.", None, ["edu", "seed"], "active", {"funding": "$86M"}),
    ("adda247", "Adda247", C, ["edtech"], 2016, "Test prep for government, banking, SSC, railway and teaching exams in several Indian languages.", "https://www.adda247.com", ["edu"], "active", {}),
    ("doubtnut", "Doubtnut", C, ["edtech"], 2016, "App that answers school maths and science doubts with short video solutions.", "https://doubtnut.com", ["edu"], "active", {"funding": "$52M"}),
    ("seekho", "Seekho", C, ["edtech"], 2021, "Short-video learning app.", None, ["edu"], "active", {"funding": "$39M"}),
    ("uolo", "Uolo", C, ["edtech"], 2020, "School platform with coding, maths and English programmes and parent-teacher tools.", "https://uolo.com", ["edu"], "active", {}),
    ("planetspark", "PlanetSpark", C, ["edtech"], 2017, "Live online classes in communication and public speaking for children.", "https://www.planetspark.in", ["edu"], "active", {"funding": "$31M"}),
    ("virohan", "Virohan", C, ["edtech", "health-biotech"], 2017, "Training for healthcare jobs.", None, ["edu"], "active", {"funding": "$28M"}),
    ("splashlearn", "SplashLearn", C, ["edtech"], 2010, "Game-based maths and reading app for young children.", "https://www.splashlearn.com", ["edu"], "active", {"funding": "$25M"}),
    ("filo", "Filo", C, ["edtech"], 2020, "Instant one-on-one live tutoring app.", "https://askfilo.com", ["edu"], "active", {"funding": "$25M"}),
    ("speakx", "speakX", C, ["edtech"], 2020, "Spoken-English learning app that grew out of Yellow Class.", None, ["edu"], "active", {}),
    ("meritnation", "Meritnation", C, ["edtech"], 2008, "Online study material and classes for school students.", "https://www.meritnation.com", ["edu"], "active", {"funding": "$15M"}),
    ("genleap", "GenLeap", C, ["edtech"], 2021, None, None, ["edu"], "active", {"funding": "$11M"}),
    ("airblack", "Airblack", C, ["edtech"], 2019, None, None, ["edu"], "active", {"funding": "$11M"}),
    ("footprints", "Footprints Childcare", C, ["edtech"], 2012, None, None, ["edu"], "active", {"funding": "$8M"}),
    ("suraasa", "Suraasa", C, ["edtech"], 2017, None, None, ["edu"], "active", {"funding": "$7M"}),
    ("onlinetyari", "OnlineTyari", C, ["edtech"], 2014, None, None, ["edu"], "active", {"funding": "$6M"}),
    ("digiaccel", "Digiaccel Learning", C, ["edtech"], 2022, None, None, ["edu"], "active", {"funding": "$3.6M"}),
    ("stones2milestones", "Stones2Milestones", C, ["edtech"], 2008, None, None, ["edu"], "active", {"funding": "$3M"}),
    ("swiflearn", "Swiflearn", C, ["edtech"], 2019, None, None, ["edu"], "active", {"funding": "$3M"}),
    ("lecturenotes", "LectureNotes", C, ["edtech"], 2017, None, None, ["edu"], "active", {"funding": "$3M"}),
    ("vidyakul", "Vidyakul", C, ["edtech"], 2019, None, None, ["edu"], "active", {"funding": "$2.6M"}),
    ("dhurina", "Dhurina", C, ["edtech"], 2019, None, None, ["edu"], "active", {"funding": "$2.5M"}),
    ("yolearn", "YoLearn.ai", C, ["edtech", "ai-ml"], None, None, None, [], "active", {"extra_source": ("https://www.ipoplatform.com/Funding-news/yolearnai-raises-funding-1", "News: Gurugram startup YoLearn.ai raises funding")}),
    # --- AI ---
    ("spyne", "Spyne", C, ["ai-ml"], 2018, "AI that turns phone photos of cars and products into studio-quality catalogue images.", "https://www.spyne.ai", ["ai"], "active", {"funding": "$24.2M"}),
    ("intello-labs", "Intello Labs", C, ["ai-ml", "agri-climate"], 2016, "Computer vision for grading the quality of fruit, vegetables and grains.", "https://www.intellolabs.com", ["ai"], "active", {"funding": "$20.9M"}),
    ("awiros", "Awiros", C, ["ai-ml"], 2015, "Video-analytics platform with an app marketplace for computer-vision use cases.", "https://www.awiros.com", ["ai"], "active", {"funding": "$7M"}),
    ("phot-ai", "Phot.ai", C, ["ai-ml"], 2022, None, None, ["ai"], "active", {"funding": "$3.7M"}),
    ("hirebound", "HireBound", C, ["ai-ml"], 2024, None, None, ["ai"], "active", {"funding": "$2M"}),
    ("febi-ai", "Febi.ai", C, ["ai-ml"], 2022, None, None, ["ai"], "active", {"funding": "$2M"}),
    ("vibrium", "Vibrium", C, ["ai-ml"], 2025, None, None, ["ai"], "active", {"funding": "$1M"}),
    ("mynzo-carbon", "Mynzo Carbon", C, ["ai-ml", "agri-climate"], 2022, None, None, ["ai"], "active", {}),
    ("dubverse", "Dubverse", C, ["ai-ml"], 2021, "AI dubbing and voice-over for video in many languages.", None, ["ai"], "active", {}),
    ("wyzard-ai", "Wyzard.ai", C, ["ai-ml"], 2024, None, None, ["ai"], "active", {}),
    ("neurosensum", "Neurosensum", C, ["ai-ml", "enterprise-saas"], None, None, None, ["ent"], "active", {}),
    ("fleetx", "Fleetx", C, ["logistics-mobility", "enterprise-saas"], None, "Fleet-management software for trucking and logistics operators.", "https://www.fleetx.io", ["seed"], "active", {}),
    ("neogeoinfo", "NeoGeoInfo Technologies", C, ["enterprise-saas"], None, None, None, ["seed"], "active", {}),
    # --- Health ---
    ("pb-healthcare", "PB Healthcare", C, ["health-biotech"], 2025, None, None, ["health"], "active", {"funding": "$218M"}),
    ("tata-1mg", "Tata 1mg", C, ["health-biotech", "commerce-marketplaces"], 2015, "Online pharmacy, lab tests and teleconsultations.", "https://www.1mg.com", ["health"], "active", {"funding": "$200M"}),
    ("pristyn-care", "Pristyn Care", C, ["health-biotech"], 2018, "Network of clinics and partner hospitals for elective surgeries, with end-to-end patient support.", "https://www.pristyncare.com", ["health"], "active", {"funding": "$181M"}),
    ("temple", "Temple", C, ["health-biotech", "hardware-robotics"], 2024, None, None, ["health", "seed"], "active", {"funding": "$54M"}),
    ("docprime", "DocPrime", C, ["health-biotech"], 2018, None, None, ["health"], "active", {}),
    ("vetic", "Vetic", C, ["health-biotech"], 2022, "Chain of tech-enabled veterinary clinics for pets.", None, ["health"], "active", {"funding": "$43.7M"}),
    ("hexahealth", "HexaHealth", C, ["health-biotech"], 2021, "Surgery-care platform that guides patients to hospitals and handles the process.", None, ["health"], "active", {"funding": "$23.5M"}),
    ("boon", "Boon", C, ["health-biotech"], 2015, None, None, ["health"], "active", {}),
    ("emoha", "Emoha Elder Care", C, ["health-biotech"], 2019, "Elder-care services and community for older adults.", None, ["health"], "active", {"funding": "$21.2M"}),
    ("healthians", "Healthians", C, ["health-biotech"], 2014, "At-home diagnostic tests and health check-ups.", "https://www.healthians.com", ["health"], "active", {"funding": "$15.2M"}),
    ("sukoon-health", "Sukoon Health", C, ["health-biotech"], 2018, None, None, ["health"], "active", {"funding": "$15M"}),
    ("breathe-well-being", "Breathe Well-being", C, ["health-biotech"], 2020, None, None, ["health"], "active", {"funding": "$12.7M"}),
    ("meddo", "Meddo", C, ["health-biotech"], 2018, None, None, ["health"], "active", {"funding": "$12M"}),
    ("gabit", "Gabit", C, ["health-biotech"], 2023, None, None, ["health"], "active", {"funding": "$9.5M"}),
    ("shyft", "Shyft", C, ["health-biotech"], 2019, None, None, ["health"], "active", {"funding": "$8M"}),
    ("lissun", "Lissun", C, ["health-biotech"], 2021, "Mental-health and child-development care, with child development centres.", None, ["health"], "active", {"funding": "$7.8M"}),
    ("zoplar", "Zoplar", C, ["health-biotech"], 2022, None, None, ["health"], "active", {"funding": "$6.8M"}),
    ("myhealthcare", "MyHealthcare", C, ["health-biotech"], 2017, None, None, ["health"], "active", {"funding": "$5M"}),
    ("medecube", "medECUBE Healthcare", C, ["health-biotech"], 2015, None, None, ["health"], "active", {"funding": "$4M"}),
    ("oncare", "Oncare", C, ["health-biotech"], 2023, None, None, ["health"], "active", {"funding": "$4M"}),
    # --- Other seedtable / revenue lists ---
    ("elivaas", "Elivaas", C, ["travel-hospitality"], None, None, None, ["seed"], "active", {}),
    ("30-sundays", "30 Sundays", C, ["travel-hospitality"], None, None, None, ["seed"], "active", {}),
    ("quick-clean", "Quick Clean", C, ["consumer-services"], None, None, None, ["seed"], "active", {}),
    ("bijak", "Bijak", C, ["agri-climate", "commerce-marketplaces"], None, "B2B marketplace for agricultural produce trade.", None, [], "active", {"extra_source": ("https://fliarbi.com/companies/top-startups-in-gurugram/", "Fliarbi: Gurugram startups")}),
    ("farmart", "FarMart", C, ["agri-climate"], 2015, None, None, [], "active", {"extra_source": ("https://fliarbi.com/companies/top-startups-in-gurugram/", "Fliarbi: Gurugram startups ranked by revenue")}),
    ("salescode-ai", "SalesCode.ai", C, ["ai-ml", "enterprise-saas"], None, None, None, [], "active", {"extra_source": ("https://fliarbi.com/companies/top-startups-in-gurugram/", "Fliarbi: Gurugram startups")}),
    ("adyogi", "Adyogi", C, ["enterprise-saas"], None, "Marketing automation software.", None, [], "active", {"extra_source": ("https://fliarbi.com/companies/top-startups-in-gurugram/", "Fliarbi: Gurugram startups")}),
    ("bobble-ai", "Bobble AI", C, ["ai-ml"], None, "Keyboard app with stickers, GIFs and AI-powered typing tools.", None, [], "active", {"extra_source": ("https://fliarbi.com/companies/top-startups-in-gurugram/", "Fliarbi: Gurugram startups")}),
    ("scrubsy", "Scrubsy", C, ["consumer-services"], None, None, None, [], "active", {"extra_source": ("https://www.ipoplatform.com/Funding-news/scrubsy-raises-funding", "News: Gurugram startup Scrubsy raises $3M")}),
]

SUPPORT = [
    ("startup-haryana", "Startup Haryana", "government_program", "Haryana government startup portal: registration, incubator directory, state incentives, mentors and schemes.", "https://startupharyana.gov.in", "Chandigarh (serves all of Haryana)", ("https://startupharyana.gov.in/", "Run by Industries and Commerce, Haryana")),
    ("mdi-gurgaon", "Management Development Institute (MDI)", "university_research", "Business school in Gurugram.", None, "Gurugram", ("https://en.wikipedia.org/wiki/Gurgaon", "Wikipedia's Gurgaon article lists it among the city's institutions")),
    ("bml-munjal-university", "BML Munjal University", "university_research", None, None, "Gurugram", ("https://en.wikipedia.org/wiki/Gurgaon", "Wikipedia's Gurgaon article lists it among the city's institutions")),
    ("amity-university-gurgaon", "Amity University Gurugram", "university_research", None, None, "Gurugram", ("https://en.wikipedia.org/wiki/Gurgaon", "Wikipedia's Gurgaon article lists it among the city's institutions")),
    ("northcap-university", "The NorthCap University", "university_research", None, None, "Gurugram", ("https://en.wikipedia.org/wiki/Gurgaon", "Wikipedia's Gurgaon article lists it among the city's institutions")),
    ("gurugram-university", "Gurugram University", "university_research", None, None, "Gurugram", ("https://en.wikipedia.org/wiki/Gurgaon", "Wikipedia's Gurgaon article lists it among the city's institutions")),
    ("masters-union", "Masters' Union", "university_research", "Business school offering practitioner-led management programmes.", None, "Gurugram", ("https://en.wikipedia.org/wiki/Masters%27_Union", "Wikipedia article on the school")),
]


def main():
    addr = {}
    with open(ROOT / "research" / "addresses.tsv") as f:
        for row in csv.DictReader(f, delimiter="\t"):
            addr[row["slug"]] = row

    out, seen = [], set()
    for slug, name, kind, sectors, founded, one_liner, website, lists, status, extra in ORGS:
        assert slug not in seen, slug
        seen.add(slug)
        sources = [{"url": L[k], "note": NOTE[k], "fields": ["listing", "sector", "founded_year"] if k != "seed" else ["listing"], "retrieved": TODAY} for k in lists]
        if "extra_source" in extra:
            url, note = extra["extra_source"]
            sources.append({"url": url, "note": note, "fields": ["listing"], "retrieved": TODAY})
        area = AREA.get(slug)
        if area:
            a = addr[slug]
            sources.append({"url": a["source_url"], "note": "Office address on public record, used to place the pin at sector level", "fields": ["area"], "retrieved": TODAY})
        assert sources, slug
        out.append({
            "slug": slug, "name": name, "kind": kind, "sectors": sectors, "status": status,
            "one_liner": one_liner, "website": website, "founded_year": founded,
            "acquired_by": extra.get("acquired_by"), "funding_note": extra.get("funding"),
            "municipality": "Gurugram", "area": area,
            "location_precision": "area" if area else "municipality",
            "connected_to": ["blinkit"] if slug == "eternal" else (["eternal"] if slug == "blinkit" else (["oxyzo"] if slug == "ofbusiness" else (["ofbusiness"] if slug == "oxyzo" else []))),
            "hiring": None, "job_board": None, "verification": "unverified",
            "sources": sources, "updated_at": TODAY,
        })
    for slug, name, kind, one_liner, website, muni, (url, note) in SUPPORT:
        assert slug not in seen, slug
        seen.add(slug)
        out.append({
            "slug": slug, "name": name, "kind": kind, "sectors": [], "status": "active",
            "one_liner": one_liner, "website": website, "founded_year": None, "acquired_by": None,
            "funding_note": None, "municipality": muni, "area": None, "location_precision": "municipality",
            "connected_to": [], "hiring": None, "job_board": None, "verification": "unverified",
            "sources": [{"url": url, "note": note, "fields": ["listing"], "retrieved": TODAY}],
            "updated_at": TODAY,
        })
    missing = set(AREA) - seen
    assert not missing, missing
    (ROOT / "data" / "seed.json").write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
    pinned = sum(1 for o in out if o["area"])
    print(f"{len(out)} organisations, {pinned} pinned, {len(out) - pinned} listed without a pin")


if __name__ == "__main__":
    main()
