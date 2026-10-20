
  # Testing                                                                                                                               
                                                                                                                                          
  Simulate payments to test your integration.                                                                                             
                                                                                                                                          
  ## Start here: Integrate with Stripe using skills and plugins                                                                           
                                                                                                                                          
  Stripe provides skills and plugins for agents to build faster and more accurately. See ]8;id=3531550973;https://docs.stripe.com/skills.mdAgent skills]8;; ]8;id=3531550973;https://docs.stripe.com/skills.mdhttps://docs.stripe.com/skills.md]8;;   
  for more information.                                                                                                                   
                                                                                                                                          
  **Quickstart**: Install the Stripe CLI with npm install -g @stripe/cli and run stripe agent setup.                                      
                                                                                                                                          
  Test your integration in a *sandbox* (A sandbox is an isolated test environment that allows you to test Stripe functionality in your    
  account without affecting your live integration. Use sandboxes to safely experiment with new features and changes) by simulating        
  transactions with test values—these transactions don’t move funds.                                                                      
                                                                                                                                          
  You can access your sandboxes using the account picker in the ]8;id=3320736638;https://dashboard.stripe.com/sandboxesDashboard]8;; ]8;id=3320736638;https://dashboard.stripe.com/sandboxeshttps://dashboard.stripe.com/sandboxes]8;;.                         
                                                                                                                                          
  Test cards act as “fake” credit cards, and allow you to simulate the following scenarios:                                               
                                                                                                                                          
  • Successful payments by ]8;id=349262491;https://docs.stripe.com/testing.md#cardscard brand]8;; ]8;id=349262491;https://docs.stripe.com/testing.md#cardshttps://docs.stripe.com/testing.md#cards]8;; or ]8;id=2399572190;https://docs.stripe.com/testing.md#international-cardscountry]8;; ]8;id=2399572190;https://docs.stripe.com/testing.md#international-cardshttps://docs.stripe.com/testing.]8;;                
  ]8;id=2399572190;https://docs.stripe.com/testing.md#international-cardsmd#international-cards]8;;                                                                                                                  
  • Card errors due to ]8;id=2328240082;https://docs.stripe.com/testing.md#declined-paymentsdeclines]8;; ]8;id=2328240082;https://docs.stripe.com/testing.md#declined-paymentshttps://docs.stripe.com/testing.md#declined-payments]8;;, ]8;id=1265554977;https://docs.stripe.com/testing.md#fraud-preventionfraud]8;; ]8;id=1265554977;https://docs.stripe.com/testing.md#fraud-preventionhttps://docs.stripe.com/testing.md#fraud-]8;;     
  ]8;id=1265554977;https://docs.stripe.com/testing.md#fraud-preventionprevention]8;;, or ]8;id=2829517019;https://docs.stripe.com/testing.md#trigger-an-error-with-invalid-datainvalid data]8;; ]8;id=2829517019;https://docs.stripe.com/testing.md#trigger-an-error-with-invalid-datahttps://docs.stripe.com/testing.md#trigger-an-error-with-invalid-data]8;;                                       
  • ]8;id=840065669;https://docs.stripe.com/testing.md#disputesDisputes]8;; ]8;id=840065669;https://docs.stripe.com/testing.md#disputeshttps://docs.stripe.com/testing.md#disputes]8;;, including early fraud warnings, and ]8;id=1786206039;https://docs.stripe.com/testing.md#refundsrefunds]8;; ]8;id=1786206039;https://docs.stripe.com/testing.md#refundshttps://docs.stripe.com/testing.]8;;    
  ]8;id=1786206039;https://docs.stripe.com/testing.md#refundsmd#refunds]8;;                                                                                                                              
  • Authentication with ]8;id=2776047828;https://docs.stripe.com/testing.md#regulatory-cards3D Secure]8;; ]8;id=2776047828;https://docs.stripe.com/testing.md#regulatory-cardshttps://docs.stripe.com/testing.md#regulatory-cards]8;; and ]8;id=1797981844;https://docs.stripe.com/testing.md#terminalPINs]8;; ]8;id=1797981844;https://docs.stripe.com/testing.md#terminalhttps://docs.stripe.com/testing.md#terminal]8;;
                                                                                                                                          
  You can also test non-card payments in a sandbox. Non-card payments are payment methods that aren’t credit or debit cards. Stripe       
  supports various non-card payment options, such as digital wallets and bank transfers. ]8;id=2447773116;https://docs.stripe.com/testing.md#non-card-paymentsEach payment method]8;;                              
  ]8;id=2447773116;https://docs.stripe.com/testing.md#non-card-paymentshttps://docs.stripe.com/testing.md#non-card-payments]8;; has its own special values.                                                        
                                                                                                                                          
  If you’re testing a subscription integration, see ]8;id=2289992515;https://docs.stripe.com/billing/testing.mdTest your Billing integration]8;; ]8;id=2289992515;https://docs.stripe.com/billing/testing.mdhttps://docs.stripe.com/billing/testing.md]8;;.             
                                                                                                                                          
  Don’t use testing environments to load test your integration because you might hit ]8;id=2059221081;https://docs.stripe.com/testing.md#rate-limitsrate limits]8;; ]8;id=2059221081;https://docs.stripe.com/testing.md#rate-limitshttps://docs.stripe.com/testing.md#rate-]8;; 
  ]8;id=2059221081;https://docs.stripe.com/testing.md#rate-limitslimits]8;;. To load test your integration, see ]8;id=1036003116;https://docs.stripe.com/rate-limits.md#load-testingload testing]8;; ]8;id=1036003116;https://docs.stripe.com/rate-limits.md#load-testinghttps://docs.stripe.com/rate-limits.md#load-testing]8;;.                            
                                                                                                                                          
  ## How to use test cards                                                                                                                
                                                                                                                                          
  When you work with a test card, use ]8;id=2475632055;https://docs.stripe.com/keys.md#obtain-api-keystest API keys]8;; ]8;id=2475632055;https://docs.stripe.com/keys.md#obtain-api-keyshttps://docs.stripe.com/keys.md#obtain-api-keys]8;; in all API calls. This is true whether
  you’re serving a payment form to test interactively or writing test code.                                                               
                                                                                                                                          
  Card-level state from one test can affect later tests that use the same card. When a test depends on card-level state, use a different  
  test card for each independent end-to-end scenario.                                                                                     
                                                                                                                                          
  | #### Don't use real card details                                                                                                      
  |                                                                                                                                       
  | Don’t use real card details. The ]8;id=571040448;https://stripe.com/legal/ssa#1-your-stripe-accountStripe Services Agreement]8;; ]8;id=571040448;https://stripe.com/legal/ssa#1-your-stripe-accounthttps://stripe.com/legal/ssa#1-your-stripe-account]8;; prohibits testing in    
  live                                                                                                                                    
  | mode using real payment method details. Use your test API keys and the card numbers below.                                            
                                                                                                                                          
  ### Testing interactively                                                                                                               
                                                                                                                                          
  When testing interactively, use a card number, such as ]8;id=3701027524;https://docs.stripe.com/testing.md?testing-method=card-numbers#visa4242 4242 4242 4242]8;; ]8;id=3701027524;https://docs.stripe.com/testing.md?testing-method=card-numbers#visahttps://docs.stripe.com/testing.md?testing-method=card-]8;;      
  ]8;id=3701027524;https://docs.stripe.com/testing.md?testing-method=card-numbers#visanumbers#visa]8;;. Enter the card number in the Dashboard or in any payment form.                                                            
                                                                                                                                          
  • Use a valid future date, such as **12/34**.                                                                                           
  • Use any three-digit CVC (four digits for American Express cards).                                                                     
  • Use any value you like for other form fields.                                                                                         
                                                                                                                                          
  ### Test code                                                                                                                           
                                                                                                                                          
  When writing test code, use a PaymentMethod such as ]8;id=1341382158;https://docs.stripe.com/testing.md?testing-method=payment-methods#visapm_]8;;]8;id=1341382158;https://docs.stripe.com/testing.md?testing-method=payment-methods#visacard_]8;;]8;id=1341382158;https://docs.stripe.com/testing.md?testing-method=payment-methods#visavisa]8;; ]8;id=1341382158;https://docs.stripe.com/testing.md?testing-method=payment-methods#visahttps://docs.stripe.com/testing.md?testing-method=payment-methods#visa]8;; 
  instead of a card number. We don’t recommend using card numbers directly in API calls or server-side code, even in testing environments.
  If you use them, your code might not be PCI-compliant when you go live. By default, a PaymentMethod isn’t attached to a *Customer*      
  (Customer objects represent customers of your business. They let you reuse payment methods and give you the ability to track multiple   
  payments).                                                                                                                              
                                                                                                                                          
    curl https://api.stripe.com/v1/payment_intents \                                                                                      
      -u "<<YOUR_SECRET_KEY>>:" \                                                                                                         
      -d amount=500 \                                                                                                                     
      -d currency=gbp \                                                                                                                   
      -d payment_method=pm_card_visa                                                                                                      
                                                                                                                                          
  When you’re ready to take your integration live, replace your test publishable and secret ]8;id=3330445599;https://docs.stripe.com/keys.mdAPI keys]8;; ]8;id=3330445599;https://docs.stripe.com/keys.mdhttps://docs.stripe.com/keys.md]8;; with 
  live ones.                                                                                                                              
                                                                                                                                          
  You can’t process live payments if your integration is still using your test API keys. Store live API keys in a secrets vault or        
  environment variables. Don’t store keys in source code or configuration files checked into version control. To learn how to use live    
  keys safely, see ]8;id=1204404561;https://docs.stripe.com/keys-best-practices.mdBest practices for managing secret API keys]8;; ]8;id=1204404561;https://docs.stripe.com/keys-best-practices.mdhttps://docs.stripe.com/keys-best-practices.md]8;;.                            
                                                                                                                                          
  ## Simulate a payment by card brand                                                                                                     
                                                                                                                                          
  To simulate a successful payment for a specific card brand, use test cards from the following list.                                     
                                                                                                                                          
  Cross-border fees are assessed based on the country of the card issuer. Cards where the issuer country isn’t the US (such as JCB and    
  UnionPay) might be subject to a cross-border fee, even in testing environments.                                                         
                                                                                                                                          
  #### Card numbers                                                                                                                       
                                                                                                                                          
   Brand                            | Number                          | CVC                             | Date                            
  ----------------------------------|---------------------------------|---------------------------------|---------------------------------
   Visa                             | 4242424242424242                | Any 3 digits                    | Any future date                 
   Visa (debit)                     | 4000056655665556                | Any 3 digits                    | Any future date                 
   Mastercard                       | 5555555555554444                | Any 3 digits                    | Any future date                 
   Mastercard (2-series)            | 2223003122003222                | Any 3 digits                    | Any future date                 
   Mastercard (debit)               | 5200828282828210                | Any 3 digits                    | Any future date                 
   Mastercard (prepaid)             | 5105105105105100                | Any 3 digits                    | Any future date                 
   American Express                 | 378282246310005                 | Any 4 digits                    | Any future date                 
   American Express                 | 371449635398431                 | Any 4 digits                    | Any future date                 
   Discover                         | 6011111111111117                | Any 3 digits                    | Any future date                 
   Discover                         | 6011000990139424                | Any 3 digits                    | Any future date                 
   Discover (debit)                 | 6011981111111113                | Any 3 digits                    | Any future date                 
   Diners Club                      | 3056930009020004                | Any 3 digits                    | Any future date                 
   Diners Club (14-digit card)      | 36227206271667                  | Any 3 digits                    | Any future date                 
   BCcard and DinaCard              | 6555900000604105                | Any 3 digits                    | Any future date                 
   JCB                              | 3566002020360505                | Any 3 digits                    | Any future date                 
   UnionPay                         | 6200000000000005                | Any 3 digits                    | Any future date                 
   UnionPay (debit)                 | 6200000000000047                | Any 3 digits                    | Any future date                 
   UnionPay (19-digit card)         | 6205500000000000004             | Any 3 digits                    | Any future date                 
                                                                                                                                          
  #### PaymentMethods                                                                                                                     
                                                                                                                                          
   Brand                                                              | PaymentMethod                                                     
  --------------------------------------------------------------------|-------------------------------------------------------------------
   Visa                                                               | pm_card_visa                                                      
   Visa (debit)                                                       | pm_card_visa_debit                                                
   Mastercard                                                         | pm_card_mastercard                                                
   Mastercard (debit)                                                 | pm_card_mastercard_debit                                          
   Mastercard (prepaid)                                               | pm_card_mastercard_prepaid                                        
   American Express                                                   | pm_card_amex                                                      
   Discover                                                           | pm_card_discover                                                  
   Diners Club                                                        | pm_card_diners                                                    
   JCB                                                                | pm_card_jcb                                                       
   UnionPay                                                           | pm_card_unionpay                                                  
                                                                                                                                          
  #### Tokens                                                                                                                             
                                                                                                                                          
  Most integrations don’t use tokens anymore, but we make test tokens such as ]8;id=1684347029;https://docs.stripe.com/testing.md?testing-method=tokens#visatok_]8;;]8;id=1684347029;https://docs.stripe.com/testing.md?testing-method=tokens#visavisa]8;; ]8;id=1684347029;https://docs.stripe.com/testing.md?testing-method=tokens#visahttps://docs.stripe.com/testing.md?testing-]8;;        
  ]8;id=1684347029;https://docs.stripe.com/testing.md?testing-method=tokens#visamethod=tokens#visa]8;; available if you need them.                                                                                          
                                                                                                                                          
   Brand                                                              | Token                                                             
  --------------------------------------------------------------------|-------------------------------------------------------------------
   Visa                                                               | tok_visa                                                          
   Visa (debit)                                                       | tok_visa_debit                                                    
   Mastercard                                                         | tok_mastercard                                                    
   Mastercard (debit)                                                 | tok_mastercard_debit                                              
   Mastercard (prepaid)                                               | tok_mastercard_prepaid                                            
   American Express                                                   | tok_amex                                                          
   Discover                                                           | tok_discover                                                      
   Diners Club                                                        | tok_diners                                                        
   JCB                                                                | tok_jcb                                                           
   UnionPay                                                           | tok_unionpay                                                      
                                                                                                                                          
  Most Cartes Bancaires and eftpos cards are co-branded with either Visa or Mastercard. The test cards in the following table simulate    
  successful payments with co-branded cards.                                                                                              
                                                                                                                                          
  #### Card numbers                                                                                                                       
                                                                                                                                          
   Brand/Co-brand                   | Number                          | CVC                             | Date                            
  ----------------------------------|---------------------------------|---------------------------------|---------------------------------
   Cartes Bancaires/Visa            | 4000002500001001                | Any 3 digits                    | Any future date                 
   Cartes Bancaires/Mastercard      | 5555552500001001                | Any 3 digits                    | Any future date                 
   eftpos Australia/Visa            | 4000050360000001                | Any 3 digits                    | Any future date                 
   eftpos Australia/Mastercard      | 5555050360000080                | Any 3 digits                    | Any future date                 
                                                                                                                                          
  #### PaymentMethods                                                                                                                     
                                                                                                                                          
   Brand                                                              | PaymentMethod                                                     
  --------------------------------------------------------------------|-------------------------------------------------------------------
   Cartes Bancaires/Visa                                              | pm_card_visa_cartesBancaires                                      
   Cartes Bancaires/Mastercard                                        | pm_card_mastercard_cartesBancaires                                
   eftpos Australia/Visa                                              | pm_card_visa_debit_eftposAuCoBranded                              
   eftpos Australia/Mastercard                                        | pm_card_mastercard_debit_eftposAuCoBranded                        
                                                                                                                                          
  #### Tokens                                                                                                                             
                                                                                                                                          
  Most integrations don’t use tokens anymore, but we make test tokens such as ]8;id=1684347029;https://docs.stripe.com/testing.md?testing-method=tokens#visatok_]8;;]8;id=1684347029;https://docs.stripe.com/testing.md?testing-method=tokens#visavisa]8;; ]8;id=1684347029;https://docs.stripe.com/testing.md?testing-method=tokens#visahttps://docs.stripe.com/testing.md?testing-]8;;        
  ]8;id=1684347029;https://docs.stripe.com/testing.md?testing-method=tokens#visamethod=tokens#visa]8;; available if you need them.                                                                                          
                                                                                                                                          
   Brand                                                              | Token                                                             
  --------------------------------------------------------------------|-------------------------------------------------------------------
   Cartes Bancaires/Visa                                              | tok_visa_cartesBancaires                                          
   Cartes Bancaires/Mastercard                                        | tok_mastercard_cartesBancaires                                    
   eftpos Australia/Visa                                              | tok_visa_debit_eftposAuCoBranded                                  
   eftpos Australia/Mastercard                                        | tok_mastercard_debit_eftposAuCoBranded                            
                                                                                                                                          
  ## Simulate a payment by country                                                                                                        
                                                                                                                                          
  To simulate successful payments from specific countries, use test cards from the following sections.                                    
                                                                                                                                          
  | *Strong Customer Authentication* (Strong Customer Authentication (SCA) is a regulatory requirement in effect as of September 14, 2019,
  | that impacts many European online payments. It requires customers to use two-factor authentication like 3D Secure to verify their     
  | purchase) regulations require *3D Secure* (3D Secure (3DS) provides an additional layer of authentication for credit card transactions
  | that protects businesses from liability for fraudulent card payments) authentication for online payments within the *European Economic
  | Area* (The European Economic Area is a regional single market with free movement of labor, goods, and capital. It encompasses the     
  | European Union member states and three additional states that are part of the European Free Trade Association). The test cards in the 
  | Europe and Middle East section simulate a payment that succeeds without authentication. We also recommend testing authentication      
  | scenarios using ]8;id=2776047828;https://docs.stripe.com/testing.md#regulatory-cards3D Secure test cards]8;; ]8;id=2776047828;https://docs.stripe.com/testing.md#regulatory-cardshttps://docs.stripe.com/testing.md#regulatory-cards]8;;.                                             
                                                                                                                                          
  #### Card numbers                                                                                                                       
                                                                                                                                          
   Country                                     | Number                                      | Brand                                      
  ---------------------------------------------|---------------------------------------------|--------------------------------------------
   **AMERICAS**                                |                                             |                                            
   United States (US)                          | 4242424242424242                            | Visa                                       
   Argentina (AR)                              | 4000000320000021                            | Visa                                       
   Brazil (BR)                                 | 4000000760000002                            | Visa                                       
   Canada (CA)                                 | 4000001240000000                            | Visa                                       
   Chile (CL)                                  | 4000001520000001                            | Visa                                       
   Colombia (CO)                               | 4000001700000003                            | Visa                                       
   Costa Rica (CR)                             | 4000001880000005                            | Visa                                       
   Ecuador (EC)                                | 4000002180000000                            | Visa                                       
   Mexico (MX)                                 | 4000004840008001                            | Visa                                       
   Mexico (MX)                                 | 5062210000000009                            | Carnet                                     
   Panama (PA)                                 | 4000005910000000                            | Visa                                       
   Paraguay (PY)                               | 4000006000000066                            | Visa                                       
   Peru (PE)                                   | 4000006040000068                            | Visa                                       
   Uruguay (UY)                                | 4000008580000003                            | Visa                                       
   **EUROPE and MIDDLE EAST**                  |                                             |                                            
   United Arab Emirates (AE)                   | 4000007840000001                            | Visa                                       
   United Arab Emirates (AE)                   | 5200007840000022                            | Mastercard                                 
   Austria (AT)                                | 4000000400000008                            | Visa                                       
   Belgium (BE)                                | 4000000560000004                            | Visa                                       
   Bulgaria (BG)                               | 4000001000000000                            | Visa                                       
   Belarus (BY)                                | 4000001120000005                            | Visa                                       
   Croatia (HR)                                | 4000001910000009                            | Visa                                       
   Cyprus (CY)                                 | 4000001960000008                            | Visa                                       
   Czech Republic (CZ)                         | 4000002030000002                            | Visa                                       
   Denmark (DK)                                | 4000002080000001                            | Visa                                       
   Estonia (EE)                                | 4000002330000009                            | Visa                                       
   Finland (FI)                                | 4000002460000001                            | Visa                                       
   France (FR)                                 | 4000002500000003                            | Visa                                       
   Germany (DE)                                | 4000002760000016                            | Visa                                       
   Gibraltar (GI)                              | 4000002920000005                            | Visa                                       
   Greece (GR)                                 | 4000003000000030                            | Visa                                       
   Hungary (HU)                                | 4000003480000005                            | Visa                                       
   Ireland (IE)                                | 4000003720000005                            | Visa                                       
   Italy (IT)                                  | 4000003800000008                            | Visa                                       
   Latvia (LV)                                 | 4000004280000005                            | Visa                                       
   Liechtenstein (LI)                          | 4000004380000004                            | Visa                                       
   Lithuania (LT)                              | 4000004400000000                            | Visa                                       
   Luxembourg (LU)                             | 4000004420000006                            | Visa                                       
   Malta (MT)                                  | 4000004700000007                            | Visa                                       
   Netherlands (NL)                            | 4000005280000002                            | Visa                                       
   Norway (NO)                                 | 4000005780000007                            | Visa                                       
   Poland (PL)                                 | 4000006160000005                            | Visa                                       
   Portugal (PT)                               | 4000006200000007                            | Visa                                       
   Romania (RO)                                | 4000006420000001                            | Visa                                       
   Saudi Arabia (SA)                           | 4000006820000007                            | Visa                                       
   Slovenia (SI)                               | 4000007050000006                            | Visa                                       
   Slovakia (SK)                               | 4000007030000001                            | Visa                                       
   Spain (ES)                                  | 4000007240000007                            | Visa                                       
   Sweden (SE)                                 | 4000007520000008                            | Visa                                       
   Switzerland (CH)                            | 4000007560000009                            | Visa                                       
   United Kingdom (GB)                         | 4000008260000000                            | Visa                                       
   United Kingdom (GB)                         | 4000058260000005                            | Visa (debit)                               
   United Kingdom (GB)                         | 5555558265554449                            | Mastercard                                 
   **ASIA PACIFIC**                            |                                             |                                            
                                                                                                                                          
  | To test subscriptions that require mandates and pre-debit notifications, see ]8;id=2049923377;https://docs.stripe.com/india-recurring-payments.md?integration=paymentIntents-setupIntents#testingIndia recurring payments]8;; ]8;id=2049923377;https://docs.stripe.com/india-recurring-payments.md?integration=paymentIntents-setupIntents#testinghttps://docs.stripe.com/india-]8;;  
  | ]8;id=2049923377;https://docs.stripe.com/india-recurring-payments.md?integration=paymentIntents-setupIntents#testingrecurring-payments.md?integration=paymentIntents-setupIntents#testing]8;;. | | Australia (AU) | 4000000360000006 | Visa | | China (CN) |  
  | 4000001560000002 | Visa | | Hong Kong (HK) | 4000003440000004 | Visa | | India (IN) | 4000003560000008 | Visa | | Japan (JP) |        
  | 4000003920000003 | Visa | | Japan (JP) | 3530111333300000 | JCB | | Malaysia (MY) | 4000004580000002 | Visa | | New Zealand (NZ) |    
  | 4000005540000008 | Visa | | Singapore (SG) | 4000007020000003 | Visa | | Taiwan (TW) | 4000001580000008 | Visa | | Thailand (TH) |    
  | 4000007640000003 | Visa (credit) | | Thailand (TH) | 4000057640000008 | Visa (debit) |                                                
                                                                                                                                          
  #### PaymentMethods                                                                                                                     
                                                                                                                                          
   Country                                     | PaymentMethod                               | Brand                                      
  ---------------------------------------------|---------------------------------------------|--------------------------------------------
   **AMERICAS**                                |                                             |                                            
   United States (US)                          | pm_card_us                                  | Visa                                       
   Argentina (AR)                              | pm_card_ar                                  | Visa                                       
   Brazil (BR)                                 | pm_card_br                                  | Visa                                       
   Canada (CA)                                 | pm_card_ca                                  | Visa                                       
   Chile (CL)                                  | pm_card_cl                                  | Visa                                       
   Colombia (CO)                               | pm_card_co                                  | Visa                                       
   Costa Rica (CR)                             | pm_card_cr                                  | Visa                                       
   Ecuador (EC)                                | pm_card_ec                                  | Visa                                       
   Mexico (MX)                                 | pm_card_mx                                  | Visa                                       
   Panama (PA)                                 | pm_card_pa                                  | Visa                                       
   Paraguay (PY)                               | pm_card_py                                  | Visa                                       
   Peru (PE)                                   | pm_card_pe                                  | Visa                                       
   Uruguay (UY)                                | pm_card_uy                                  | Visa                                       
   **EUROPE and MIDDLE EAST**                  |                                             |                                            
                                                                                                                                          
  | *Strong Customer Authentication* (Strong Customer Authentication (SCA) is a regulatory requirement in effect as of September 14, 2019,
  | that impacts many European online payments. It requires customers to use two-factor authentication like 3D Secure to verify their     
  | purchase) regulations require *3D Secure* (3D Secure (3DS) provides an additional layer of authentication for credit card transactions
  | that protects businesses from liability for fraudulent card payments) authentication for online payments within the *European Economic
  | Area* (The European Economic Area is a regional single market with free movement of labor, goods, and capital. It encompasses the     
  | European Union member states and three additional states that are part of the European Free Trade Association). The test cards in this
  | section simulate a payment that succeeds without authentication. We recommend also testing scenarios that involve authentication,     
  using                                                                                                                                   
  | ]8;id=2776047828;https://docs.stripe.com/testing.md#regulatory-cards3D Secure test cards]8;; ]8;id=2776047828;https://docs.stripe.com/testing.md#regulatory-cardshttps://docs.stripe.com/testing.md#regulatory-cards]8;;. | | United Arab Emirates (AE) | pm_card_ae | Visa | | United
  | Arab Emirates (AE) | pm_card_ae_mastercard | Mastercard | | Austria (AT) | pm_card_at | Visa | | Belgium (BE) | pm_card_be | Visa | | 
  | Bulgaria (BG) | pm_card_bg | Visa | | Belarus (BY) | pm_card_by | Visa | | Croatia (HR) | pm_card_hr | Visa | | Cyprus (CY) |         
  | pm_card_cy | Visa | | Czech Republic (CZ) | pm_card_cz | Visa | | Denmark (DK) | pm_card_dk | Visa | | Estonia (EE) | pm_card_ee |    
  Visa                                                                                                                                    
  | | | Finland (FI) | pm_card_fi | Visa | | France (FR) | pm_card_fr | Visa | | Germany (DE) | pm_card_de | Visa | | Gibraltar (GI) |    
  | pm_card_gi | Visa | | Greece (GR) | pm_card_gr | Visa | | Hungary (HU) | pm_card_hu | Visa | | Ireland (IE) | pm_card_ie | Visa | |   
  | Italy (IT) | pm_card_it | Visa | | Latvia (LV) | pm_card_lv | Visa | | Liechtenstein (LI) | pm_card_li | Visa | | Lithuania (LT) |    
  | pm_card_lt | Visa | | Luxembourg (LU) | pm_card_lu | Visa | | Malta (MT) | pm_card_mt | Visa | | Netherlands (NL) | pm_card_nl | Visa |
  | | Norway (NO) | pm_card_no | Visa | | Poland (PL) | pm_card_pl | Visa | | Portugal (PT) | pm_card_pt | Visa | | Romania (RO) |        
  | pm_card_ro | Visa | | Slovenia (SI) | pm_card_si | Visa | | Slovakia (SK) | pm_card_sk | Visa | | Spain (ES) | pm_card_es | Visa | |  
  | Sweden (SE) | pm_card_se | Visa | | Switzerland (CH) | pm_card_ch | Visa | | United Kingdom (GB) | pm_card_gb | Visa | | United       
  Kingdom                                                                                                                                 
  | (GB) | pm_card_gb_debit | Visa (debit) | | United Kingdom (GB) | pm_card_gb_mastercard | Mastercard | | **ASIA PACIFIC** 2 To test    
  | subscriptions that require mandates and pre-debit notifications, see ]8;id=2049923377;https://docs.stripe.com/india-recurring-payments.md?integration=paymentIntents-setupIntents#testingIndia recurring payments]8;; ]8;id=2049923377;https://docs.stripe.com/india-recurring-payments.md?integration=paymentIntents-setupIntents#testinghttps://docs.stripe.com/india-recurring-]8;;
  | ]8;id=2049923377;https://docs.stripe.com/india-recurring-payments.md?integration=paymentIntents-setupIntents#testingpayments.md?integration=paymentIntents-setupIntents#testing]8;;. | | Australia (AU) | pm_card_au | Visa | | China (CN) | pm_card_cn | Visa
  | | | Hong Kong (HK) | pm_card_hk | Visa | | India (IN) | pm_card_in | Visa | | Japan (JP) | pm_card_jp | Visa | | Japan (JP) |         
  | pm_card_jcb | JCB | | Malaysia (MY) | pm_card_my | Visa | | New Zealand (NZ) | pm_card_nz | Visa | | Singapore (SG) | pm_card_sg |    
  Visa                                                                                                                                    
  | | | Taiwan (TW) | pm_card_tw | Visa | | Thailand (TH) | pm_card_th_credit | Visa (credit) | | Thailand (TH) | pm_card_th_debit | Visa 
  | (debit) |                                                                                                                             
                                                                                                                                          
  #### Tokens                                                                                                                             
                                                                                                                                          
  Most integrations don’t use tokens anymore, but we make test tokens such as ]8;id=1684347029;https://docs.stripe.com/testing.md?testing-method=tokens#visatok_]8;;]8;id=1684347029;https://docs.stripe.com/testing.md?testing-method=tokens#visavisa]8;; ]8;id=1684347029;https://docs.stripe.com/testing.md?testing-method=tokens#visahttps://docs.stripe.com/testing.md?testing-]8;;        
  ]8;id=1684347029;https://docs.stripe.com/testing.md?testing-method=tokens#visamethod=tokens#visa]8;; available if you need them.                                                                                          
                                                                                                                                          
   Country                                     | Token                                       | Brand                                      
  ---------------------------------------------|---------------------------------------------|--------------------------------------------
   **AMERICAS**                                |                                             |                                            
   United States (US)                          | tok_us                                      | Visa                                       
   Argentina (AR)                              | tok_ar                                      | Visa                                       
   Brazil (BR)                                 | tok_br                                      | Visa                                       
   Canada (CA)                                 | tok_ca                                      | Visa                                       
   Chile (CL)                                  | tok_cl                                      | Visa                                       
   Colombia (CO)                               | tok_co                                      | Visa                                       
   Costa Rica (CR)                             | tok_cr                                      | Visa                                       
   Ecuador (EC)                                | tok_ec                                      | Visa                                       
   Mexico (MX)                                 | tok_mx                                      | Visa                                       
   Panama (PA)                                 | tok_pa                                      | Visa                                       
   Paraguay (PY)                               | tok_py                                      | Visa                                       
   Peru (PE)                                   | tok_pe                                      | Visa                                       
   Uruguay (UY)                                | tok_uy                                      | Visa                                       
   **EUROPE and MIDDLE EAST**                  |                                             |                                            
   United Arab Emirates (AE)                   | tok_ae                                      | Visa                                       
   United Arab Emirates (AE)                   | tok_ae_mastercard                           | Mastercard                                 
   Austria (AT)                                | tok_at                                      | Visa                                       
   Belgium (BE)                                | tok_be                                      | Visa                                       
   Bulgaria (BG)                               | tok_bg                                      | Visa                                       
   Belarus (BY)                                | tok_by                                      | Visa                                       
   Croatia (HR)                                | tok_hr                                      | Visa                                       
   Cyprus (CY)                                 | tok_cy                                      | Visa                                       
   Czech Republic (CZ)                         | tok_cz                                      | Visa                                       
   Denmark (DK)                                | tok_dk                                      | Visa                                       
   Estonia (EE)                                | tok_ee                                      | Visa                                       
   Finland (FI)                                | tok_fi                                      | Visa                                       
   France (FR)                                 | tok_fr                                      | Visa                                       
   Germany (DE)                                | tok_de                                      | Visa                                       
   Gibraltar (GI)                              | tok_gi                                      | Visa                                       
   Greece (GR)                                 | tok_gr                                      | Visa                                       
   Hungary (HU)                                | tok_hu                                      | Visa                                       
   Ireland (IE)                                | tok_ie                                      | Visa                                       
   Italy (IT)                                  | tok_it                                      | Visa                                       
   Latvia (LV)                                 | tok_lv                                      | Visa                                       
   Liechtenstein (LI)                          | tok_li                                      | Visa                                       
   Lithuania (LT)                              | tok_lt                                      | Visa                                       
   Luxembourg (LU)                             | tok_lu                                      | Visa                                       
   Malta (MT)                                  | tok_mt                                      | Visa                                       
   Netherlands (NL)                            | tok_nl                                      | Visa                                       
   Norway (NO)                                 | tok_no                                      | Visa                                       
   Poland (PL)                                 | tok_pl                                      | Visa                                       
   Portugal (PT)                               | tok_pt                                      | Visa                                       
   Romania (RO)                                | tok_ro                                      | Visa                                       
   Slovenia (SI)                               | tok_si                                      | Visa                                       
   Slovakia (SK)                               | tok_sk                                      | Visa                                       
   Spain (ES)                                  | tok_es                                      | Visa                                       
   Sweden (SE)                                 | tok_se                                      | Visa                                       
   Switzerland (CH)                            | tok_ch                                      | Visa                                       
   United Kingdom (GB)                         | tok_gb                                      | Visa                                       
   United Kingdom (GB)                         | tok_gb_debit                                | Visa (debit)                               
   United Kingdom (GB)                         | tok_gb_mastercard                           | Mastercard                                 
   **ASIA PACIFIC**                            |                                             |                                            
                                                                                                                                          
  | To test subscriptions that require mandates and pre-debit notifications, see ]8;id=2049923377;https://docs.stripe.com/india-recurring-payments.md?integration=paymentIntents-setupIntents#testingIndia recurring payments]8;; ]8;id=2049923377;https://docs.stripe.com/india-recurring-payments.md?integration=paymentIntents-setupIntents#testinghttps://docs.stripe.com/india-]8;;  
  | ]8;id=2049923377;https://docs.stripe.com/india-recurring-payments.md?integration=paymentIntents-setupIntents#testingrecurring-payments.md?integration=paymentIntents-setupIntents#testing]8;;. | | Australia (AU) | tok_au | Visa | | China (CN) | tok_cn |   
  | Visa | | Hong Kong (HK) | tok_hk | Visa | | India (IN) | tok_in | Visa | | Japan (JP) | tok_jp | Visa | | Japan (JP) | tok_jcb | JCB |
  | | Malaysia (MY) | tok_my | Visa | | New Zealand (NZ) | tok_nz | Visa | | Singapore (SG) | tok_sg | Visa | | Taiwan (TW) | tok_tw |    
  Visa                                                                                                                                    
  | | | Thailand (TH) | tok_th_credit | Visa (credit) | | Thailand (TH) | tok_th_debit | Visa (debit) |                                   
                                                                                                                                          
  ### Simulate customer location with email                                                                                               
                                                                                                                                          
  When testing ]8;id=713585695;https://docs.stripe.com/payments/checkout.mdCheckout Sessions]8;; ]8;id=713585695;https://docs.stripe.com/payments/checkout.mdhttps://docs.stripe.com/payments/checkout.md]8;;, ]8;id=2897787229;https://docs.stripe.com/payment-links.mdPayment Links]8;; ]8;id=2897787229;https://docs.stripe.com/payment-links.mdhttps://docs.stripe.com/payment-links.md]8;;, or 
  ]8;id=3316497443;https://docs.stripe.com/payments/checkout/pricing-table.mdpricing tables]8;; ]8;id=3316497443;https://docs.stripe.com/payments/checkout/pricing-table.mdhttps://docs.stripe.com/payments/checkout/pricing-table.md]8;;, you can simulate a customer’s geographic location by using a 
  location-formatted email address. Add a +location_XX suffix to the local part of any email address, where XX is a valid two-letter ]8;id=3110177918;https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2ISO]8;;  
  ]8;id=3110177918;https://en.wikipedia.org/wiki/ISO_3166-1_alpha-23166-1 alpha-2]8;; ]8;id=3110177918;https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2]8;; country code.                                                           
                                                                                                                                          
  For example, to simulate a customer located in the United States, pass test+location_US@example.com as the customer_email parameter when
  creating a Checkout Session and as the prefilled_email ]8;id=3231544218;https://docs.stripe.com/payment-links/customize.md#customize-checkout-with-url-parametersURL parameter]8;; ]8;id=3231544218;https://docs.stripe.com/payment-links/customize.md#customize-checkout-with-url-parametershttps://docs.stripe.com/payment-links/customize.md#customize-]8;;      
  ]8;id=3231544218;https://docs.stripe.com/payment-links/customize.md#customize-checkout-with-url-parameterscheckout-with-url-parameters]8;; when creating a Payment Link.                                                                              
                                                                                                                                          
  When you visit the resulting Checkout Session URL, you see the same currency and payment methods that a customer in the specified       
  country would see. Learn more about ]8;id=2987040628;https://docs.stripe.com/payments/currencies/localize-prices/adaptive-pricing.md#testingtesting with location-formatted emails]8;; ]8;id=2987040628;https://docs.stripe.com/payments/currencies/localize-prices/adaptive-pricing.md#testinghttps://docs.stripe.com/payments/currencies/localize-]8;;        
  ]8;id=2987040628;https://docs.stripe.com/payments/currencies/localize-prices/adaptive-pricing.md#testingprices/adaptive-pricing.md#testing]8;;.                                                                                                     
                                                                                                                                          
  ## Simulate an HSA or FSA card payment                                                                                                  
                                                                                                                                          
  Use these test card numbers to simulate FSA or HSA transactions in your integration. These accounts are commonly used for medical       
  expenses, and testing with them helps you verify that your application handles healthcare-related transactions correctly.               
                                                                                                                                          
  #### Card numbers                                                                                                                       
                                                                                                                                          
   Brand/Type                       | Number                          | CVC                             | Date                            
  ----------------------------------|---------------------------------|---------------------------------|---------------------------------
   Visa FSA                         | 4000051230000072                | Any 3 digits                    | Any future date                 
   Visa HSA                         | 4000051230000072                | Any 3 digits                    | Any future date                 
   Mastercard FSA                   | 5200828282828897                | Any 3 digits                    | Any future date                 
                                                                                                                                          
  #### PaymentMethods                                                                                                                     
                                                                                                                                          
   Brand/Type                                                         | PaymentMethod                                                     
  --------------------------------------------------------------------|-------------------------------------------------------------------
   Visa FSA                                                           | pm_card_debit_visaFsaProductCode                                  
   Visa HSA                                                           | pm_card_debit_visaHsaProductCode                                  
   Mastercard FSA                                                     | pm_card_mastercard_debit_mastercardFsaProductCode                 
                                                                                                                                          
  ## Simulate a declined payment                                                                                                          
                                                                                                                                          
  To test your integration’s error-handling logic by simulating payments that the issuer declines for various reasons, use test cards from
  this section. These cards return a ]8;id=1986610090;https://docs.stripe.com/error-handling.md#payment-errorscard error]8;; ]8;id=1986610090;https://docs.stripe.com/error-handling.md#payment-errorshttps://docs.stripe.com/error-handling.md#payment-errors]8;; with the listed ]8;id=1047624692;https://docs.stripe.com/error-codes.mderror code]8;;       
  ]8;id=1047624692;https://docs.stripe.com/error-codes.mdhttps://docs.stripe.com/error-codes.md]8;; and ]8;id=1389164297;https://docs.stripe.com/declines/codes.mddecline code]8;; ]8;id=1389164297;https://docs.stripe.com/declines/codes.mdhttps://docs.stripe.com/declines/codes.md]8;;.                                      
                                                                                                                                          
  Provide a CVC when you test CVC behavior. Stripe skips the CVC check if you omit it, so the check can’t fail. To simulate an incorrect  
  CVC, use the “Incorrect CVC decline” test card listed in the following table and provide any three-digit CVC.                           
                                                                                                                                          
  #### Card numbers                                                                                                                       
                                                                                                                                          
   Description                      | Number                          | Error code                      | Decline code                    
  ----------------------------------|---------------------------------|---------------------------------|---------------------------------
   Generic decline                  | 4000000000000002                | ]8;id=235553760;https://docs.stripe.com/error-codes.md#card-declinedcard_declined[1]]8;;                | ]8;id=2579132322;https://docs.stripe.com/declines/codes.md#generic_declinegeneric_decline[2]]8;;              
   Insufficient funds decline       | 4000000000009995                | ]8;id=235553760;https://docs.stripe.com/error-codes.md#card-declinedcard_declined[1]]8;;                | ]8;id=1869573810;https://docs.stripe.com/declines/codes.md#insufficient_fundsinsufficient_funds[3]]8;;           
   Lost card decline                | 4000000000009987                | ]8;id=235553760;https://docs.stripe.com/error-codes.md#card-declinedcard_declined[1]]8;;                | ]8;id=2800100707;https://docs.stripe.com/declines/codes.md#lost_cardlost_card[4]]8;;                    
   Stolen card decline              | 4000000000009979                | ]8;id=235553760;https://docs.stripe.com/error-codes.md#card-declinedcard_declined[1]]8;;                | ]8;id=3221803704;https://docs.stripe.com/declines/codes.md#stolen_cardstolen_card[5]]8;;                  
   Expired card decline             | 4000000000000069                | ]8;id=2982269367;https://docs.stripe.com/error-codes.md#expired-cardexpired_card[6]]8;;                 | n/a                             
   Incorrect CVC decline            | 4000000000000127                | ]8;id=1729853864;https://docs.stripe.com/declines/codes.md#incorrect_cvcincorrect_cvc[7]]8;;                | n/a                             
   Processing error decline         | 4000000000000119                | ]8;id=3499946533;https://docs.stripe.com/error-codes.md#processing-errorprocessing_error[8]]8;;             | n/a                             
   Incorrect number decline         | 4242424242424241                | ]8;id=3935256579;https://docs.stripe.com/declines/codes.md#incorrect_numberincorrect_number[9]]8;;             | n/a                             
   Exceeding velocity limit decline | 4000000000006975                | ]8;id=235553760;https://docs.stripe.com/error-codes.md#card-declinedcard_declined[1]]8;;                | ]8;id=2021909494;https://docs.stripe.com/declines/codes.md#card_velocity_exceededcard_velocity_exceeded[10]]8;;      
                                                                                                                                          
   [1]: card_declined ]8;id=235553760;https://docs.stripe.com/error-codes.md#card-declinedhttps://docs.stripe.com/error-codes.md#card-declined]8;;                                                                
   [2]: generic_decline ]8;id=2579132322;https://docs.stripe.com/declines/codes.md#generic_declinehttps://docs.stripe.com/declines/codes.md#generic_decline]8;;                                                         
   [3]: insufficient_funds ]8;id=1869573810;https://docs.stripe.com/declines/codes.md#insufficient_fundshttps://docs.stripe.com/declines/codes.md#insufficient_funds]8;;                                                   
   [4]: lost_card ]8;id=2800100707;https://docs.stripe.com/declines/codes.md#lost_cardhttps://docs.stripe.com/declines/codes.md#lost_card]8;;                                                                     
   [5]: stolen_card ]8;id=3221803704;https://docs.stripe.com/declines/codes.md#stolen_cardhttps://docs.stripe.com/declines/codes.md#stolen_card]8;;                                                                 
   [6]: expired_card ]8;id=2982269367;https://docs.stripe.com/error-codes.md#expired-cardhttps://docs.stripe.com/error-codes.md#expired-card]8;;                                                                  
   [7]: incorrect_cvc ]8;id=1729853864;https://docs.stripe.com/declines/codes.md#incorrect_cvchttps://docs.stripe.com/declines/codes.md#incorrect_cvc]8;;                                                             
   [8]: processing_error ]8;id=3499946533;https://docs.stripe.com/error-codes.md#processing-errorhttps://docs.stripe.com/error-codes.md#processing-error]8;;                                                          
   [9]: incorrect_number ]8;id=3935256579;https://docs.stripe.com/declines/codes.md#incorrect_numberhttps://docs.stripe.com/declines/codes.md#incorrect_number]8;;                                                       
  [10]: card_velocity_exceeded ]8;id=2021909494;https://docs.stripe.com/declines/codes.md#card_velocity_exceededhttps://docs.stripe.com/declines/codes.md#card_velocity_exceeded]8;;                                           
                                                                                                                                          
  You can’t attach cards that simulate issuer declines to a Customer object. To simulate a declined payment with an attached card, use the
  “Decline after attaching” test card listed in the following table.                                                                      
                                                                                                                                          
   Description             | Number           | Details                                                                                   
  -------------------------|------------------|-------------------------------------------------------------------------------------------
   Decline after attaching | 4000000000000341 | Attaching this card to a ]8;id=2744136121;https://docs.stripe.com/api/customers.mdCustomer[1]]8;; object succeeds, but attempts to charge the customer 
                           |                  | fail.                                                                                     
                                                                                                                                          
  [1]: Customer ]8;id=2744136121;https://docs.stripe.com/api/customers.mdhttps://docs.stripe.com/api/customers.md]8;;                                                                                  
                                                                                                                                          
  #### PaymentMethods                                                                                                                     
                                                                                                                                          
   Description                      | Number                                           | Error code              | Decline code           
  ----------------------------------|--------------------------------------------------|-------------------------|------------------------
   Generic decline                  | pm_card_visa_chargeDeclined                      | card_declined           | generic_decline        
   Insufficient funds decline       | pm_card_visa_chargeDeclinedInsufficientFunds     | card_declined           | insufficient_funds     
   Lost card decline                | pm_card_visa_chargeDeclinedLostCard              | card_declined           | lost_card              
   Stolen card decline              | pm_card_visa_chargeDeclinedStolenCard            | card_declined           | stolen_card            
   Expired card decline             | pm_card_chargeDeclinedExpiredCard                | expired_card            | n/a                    
   Incorrect CVC decline            | pm_card_chargeDeclinedIncorrectCvc               | incorrect_cvc           | n/a                    
   Processing error decline         | pm_card_chargeDeclinedProcessingError            | processing_error        | n/a                    
   Exceeding velocity limit decline | pm_card_visa_chargeDeclinedVelocityLimitExceeded | card_declined           | card_velocity_exceeded 
                                                                                                                                          
  You can’t attach cards that simulate issuer declines to a Customer object. To simulate a declined payment with an attached card, use the
  “Decline after attaching” test card listed in the following table.                                                                      
                                                                                                                                          
   Description             | PaymentMethod              | Details                                                                         
  -------------------------|----------------------------|---------------------------------------------------------------------------------
   Decline after attaching | pm_card_chargeCustomerFail | Attaching this card to a ]8;id=2744136121;https://docs.stripe.com/api/customers.mdCustomer[1]]8;; object succeeds, but attempts to charge    
                           |                            | the customer fail.                                                              
                                                                                                                                          
  [1]: Customer ]8;id=2744136121;https://docs.stripe.com/api/customers.mdhttps://docs.stripe.com/api/customers.md]8;;                                                                                  
                                                                                                                                          
  #### Tokens                                                                                                                             
                                                                                                                                          
  Most integrations don’t use tokens anymore, but we make test tokens such as ]8;id=1684347029;https://docs.stripe.com/testing.md?testing-method=tokens#visatok_]8;;]8;id=1684347029;https://docs.stripe.com/testing.md?testing-method=tokens#visavisa]8;; ]8;id=1684347029;https://docs.stripe.com/testing.md?testing-method=tokens#visahttps://docs.stripe.com/testing.md?testing-]8;;        
  ]8;id=1684347029;https://docs.stripe.com/testing.md?testing-method=tokens#visamethod=tokens#visa]8;; available if you need them.                                                                                          
                                                                                                                                          
   Description                      | Number                                         | Error code               | Decline code            
  ----------------------------------|------------------------------------------------|--------------------------|-------------------------
   Generic decline                  | tok_visa_chargeDeclined                        | card_declined            | generic_decline         
   Insufficient funds decline       | tok_visa_chargeDeclinedInsufficientFunds       | card_declined            | insufficient_funds      
   Insufficient debit funds decline | tok_visa_debit_chargeDeclinedInsufficientFunds | card_declined            | insufficient_funds      
   Lost card decline                | tok_visa_chargeDeclinedLostCard                | card_declined            | lost_card               
   Stolen card decline              | tok_visa_chargeDeclinedStolenCard              | card_declined            | stolen_card             
   Expired card decline             | tok_chargeDeclinedExpiredCard                  | expired_card             | n/a                     
   Expired card decline             | tok_visa_chargeDeclinedExpiredCard             | expired_card             | n/a                     
   Fraudulent card decline          | tok_visa_chargeDeclinedFraudulent              | card_declined            | fraudulent              
   Incorrect CVC decline            | tok_chargeDeclinedIncorrectCvc                 | incorrect_cvc            | n/a                     
   Incorrect CVC decline            | tok_visa_chargeDeclinedIncorrectCvc            | incorrect_cvc            | n/a                     
   Processing error decline         | tok_chargeDeclinedProcessingError              | processing_error         | n/a                     
   Processing error decline         | tok_visa_chargeDeclinedProcessingError         | processing_error         | n/a                     
   Exceeding velocity limit decline | tok_visa_chargeDeclinedVelocityLimitExceeded   | card_declined            | card_velocity_exceeded  
                                                                                                                                          
  You can’t attach cards that simulate issuer declines to a Customer object. To simulate a declined payment with an attached card, use the
  “Decline after attaching” test card listed in the following table.                                                                      
                                                                                                                                          
   Description                                | Token                                 | Details                                           
  --------------------------------------------|---------------------------------------|---------------------------------------------------
   Decline after attaching                    | tok_chargeCustomerFail                | Attaching this card to a ]8;id=2744136121;https://docs.stripe.com/api/customers.mdCustomer[1]]8;; object       
                                              |                                       | succeeds, but attempts to charge the customer     
                                              |                                       | fail.                                             
   Decline after attaching                    | tok_visa_chargeCustomerFail           | Attaching this card to a ]8;id=2744136121;https://docs.stripe.com/api/customers.mdCustomer[1]]8;; object       
                                              |                                       | succeeds, but attempts to charge the customer     
                                              |                                       | fail.                                             
   Decline after attaching due to lost card   | tok_visa_chargeCustomerFailLostCard   | Attaching this card to a ]8;id=2744136121;https://docs.stripe.com/api/customers.mdCustomer[1]]8;; object       
                                              |                                       | succeeds, but attempts to charge the customer     
                                              |                                       | fail due to a lost card.                          
   Decline after attaching due to stolen card | tok_visa_chargeCustomerFailStolenCard | Attaching this card to a ]8;id=2744136121;https://docs.stripe.com/api/customers.mdCustomer[1]]8;; object       
                                              |                                       | succeeds, but attempts to charge the customer     
                                              |                                       | fail due to a stolen card.                        
                                                                                                                                          
  [1]: Customer ]8;id=2744136121;https://docs.stripe.com/api/customers.mdhttps://docs.stripe.com/api/customers.md]8;;                                                                                  
                                                                                                                                          
  ## Fraud prevention                                                                                                                     
                                                                                                                                          
  Stripe’s fraud prevention system, Radar, can block payments when they have a high risk level or fail verification checks. You can use   
  the cards in this section to test your Radar settings. You can also use them to test how your integration responds to blocked payments. 
                                                                                                                                          
  Each card simulates specific risk factors. Your Radar settings determine which risk factors cause it to block a payment. Blocked        
  payments result in ]8;id=2662585763;https://docs.stripe.com/error-handling.mdcard errors with an error code of fraud]8;; ]8;id=2662585763;https://docs.stripe.com/error-handling.mdhttps://docs.stripe.com/error-handling.md]8;;.                                   
                                                                                                                                          
  To trigger a failed CVC check, include a CVC (any three-digit number). To trigger a failed postal code check, include any valid postal  
  code. If you omit these fields, Radar skips those checks, so they can’t fail.                                                           
                                                                                                                                          
  #### Card numbers                                                                                                                       
                                                                                                                                          
   Description                                 | Number                                     | Details                                     
  ---------------------------------------------|--------------------------------------------|---------------------------------------------
   Always blocked                              | 4100000000000019                           | The charge has a ]8;id=4260339296;https://docs.stripe.com/radar/transaction-risk-prevention.md#high-riskrisk level of “highest”[1]]8;; 
                                                                                                                                          
  [1]: risk level of “highest” ]8;id=4260339296;https://docs.stripe.com/radar/transaction-risk-prevention.md#high-riskhttps://docs.stripe.com/radar/transaction-risk-prevention.md#high-risk]8;;                                     
                                                                                                                                          
  Radar always blocks it. | | Highest risk | 4000000000004954 | The charge has a ]8;id=4260339296;https://docs.stripe.com/radar/transaction-risk-prevention.md#high-riskrisk level of “highest”]8;;                                  
  ]8;id=4260339296;https://docs.stripe.com/radar/transaction-risk-prevention.md#high-riskhttps://docs.stripe.com/radar/transaction-risk-prevention.md#high-risk]8;;                                                                  
                                                                                                                                          
  Radar might block it ]8;id=2591453743;https://docs.stripe.com/radar/risk-settings.mddepending on your settings]8;; ]8;id=2591453743;https://docs.stripe.com/radar/risk-settings.mdhttps://docs.stripe.com/radar/risk-settings.md]8;;. | | Elevated risk | 4000000000009235 |  
  The charge has a ]8;id=4275739438;https://docs.stripe.com/radar/transaction-risk-prevention.md#elevated-riskrisk level of “elevated”]8;; ]8;id=4275739438;https://docs.stripe.com/radar/transaction-risk-prevention.md#elevated-riskhttps://docs.stripe.com/radar/transaction-risk-prevention.md#elevated-risk]8;;                    
                                                                                                                                          
  Radar might ]8;id=579864162;https://docs.stripe.com/radar/transaction-reviews.mdqueue it for review]8;; ]8;id=579864162;https://docs.stripe.com/radar/transaction-reviews.mdhttps://docs.stripe.com/radar/transaction-reviews.md]8;;. | | High fraud dispute score | 4000008400000407 | 
  This charge has a high fraud dispute score.                                                                                             
                                                                                                                                          
  Radar might block it ]8;id=2591453743;https://docs.stripe.com/radar/risk-settings.mddepending on your settings]8;; ]8;id=2591453743;https://docs.stripe.com/radar/risk-settings.mdhttps://docs.stripe.com/radar/risk-settings.md]8;;. | | High early fraud warning score |    
  4000008400000159 | This charge has a high early fraud warning score.                                                                    
                                                                                                                                          
  Radar might block it ]8;id=2591453743;https://docs.stripe.com/radar/risk-settings.mddepending on your settings]8;; ]8;id=2591453743;https://docs.stripe.com/radar/risk-settings.mdhttps://docs.stripe.com/radar/risk-settings.md]8;;. | | Dynamic risk thresholds |           
  4000008400001017 | This charge triggers the Radar Dynamic risk thresholds control, when enabled.                                        
                                                                                                                                          
  Radar blocks the transaction if you enable the ]8;id=1445405786;https://docs.stripe.com/radar/risk-settings.md#dynamic-risk-thresholdsDynamic risk thresholds]8;; ]8;id=1445405786;https://docs.stripe.com/radar/risk-settings.md#dynamic-risk-thresholdshttps://docs.stripe.com/radar/risk-settings.md#dynamic-risk-]8;;     
  ]8;id=1445405786;https://docs.stripe.com/radar/risk-settings.md#dynamic-risk-thresholdsthresholds]8;;. | | Free trial abuse | 4001858821843804 | This charge triggers the Radar free trial abuse risk control, when enabled.       
                                                                                                                                          
  Radar blocks the transaction if you enable the ]8;id=2591453743;https://docs.stripe.com/radar/risk-settings.mdfree trial abuse risk control]8;; ]8;id=2591453743;https://docs.stripe.com/radar/risk-settings.mdhttps://docs.stripe.com/radar/risk-settings.md]8;;. | |        
  Adaptive 3DS | 4000008405600003 | This charge triggers the Radar Adaptive 3DS risk control, when enabled.                               
                                                                                                                                          
  If you enable Adaptive 3DS, Radar requests 3DS authentication when using this test card. | | CVC check fails | 4000000000000101 | If you
  provide a CVC number, the CVC check fails.                                                                                              
                                                                                                                                          
  Radar might block it ]8;id=611376328;https://docs.stripe.com/radar/rules.md#traditional-bank-checksdepending on your settings.]8;; ]8;id=611376328;https://docs.stripe.com/radar/rules.md#traditional-bank-checkshttps://docs.stripe.com/radar/rules.md#traditional-bank-checks]8;; | | Postal code check   
  fails | 4000000000000036 | If you provide a postal code, the postal code check fails.                                                   
                                                                                                                                          
  Radar might block it ]8;id=611376328;https://docs.stripe.com/radar/rules.md#traditional-bank-checksdepending on your settings.]8;; ]8;id=611376328;https://docs.stripe.com/radar/rules.md#traditional-bank-checkshttps://docs.stripe.com/radar/rules.md#traditional-bank-checks]8;; | | CVC check fails with
  elevated risk | 4000058400307872 | If you provide a CVC number, the CVC check fails with a ]8;id=4275739438;https://docs.stripe.com/radar/transaction-risk-prevention.md#elevated-riskrisk level of “elevated”]8;;                     
  ]8;id=4275739438;https://docs.stripe.com/radar/transaction-risk-prevention.md#elevated-riskhttps://docs.stripe.com/radar/transaction-risk-prevention.md#elevated-risk]8;;                                                              
                                                                                                                                          
  Radar might block it ]8;id=611376328;https://docs.stripe.com/radar/rules.md#traditional-bank-checksdepending on your settings.]8;; ]8;id=611376328;https://docs.stripe.com/radar/rules.md#traditional-bank-checkshttps://docs.stripe.com/radar/rules.md#traditional-bank-checks]8;; | | Postal code check   
  fails with elevated risk | 4000058400306072 | If you provide a postal code, the postal code check fails with a ]8;id=4275739438;https://docs.stripe.com/radar/transaction-risk-prevention.md#elevated-riskrisk level of “elevated”]8;; 
  ]8;id=4275739438;https://docs.stripe.com/radar/transaction-risk-prevention.md#elevated-riskhttps://docs.stripe.com/radar/transaction-risk-prevention.md#elevated-risk]8;;                                                              
                                                                                                                                          
  Radar might block it ]8;id=611376328;https://docs.stripe.com/radar/rules.md#traditional-bank-checksdepending on your settings]8;; ]8;id=611376328;https://docs.stripe.com/radar/rules.md#traditional-bank-checkshttps://docs.stripe.com/radar/rules.md#traditional-bank-checks]8;;. | | Line1 check fails | 
  4000000000000028 | The address line 1 check fails.                                                                                      
                                                                                                                                          
  The payment succeeds unless you ]8;id=189020866;https://docs.stripe.com/radar/rules/reference.md#post-authorization-attributesblock it with a custom Radar rule]8;; ]8;id=189020866;https://docs.stripe.com/radar/rules/reference.md#post-authorization-attributeshttps://docs.stripe.com/radar/rules/reference.md#post-authorization-]8;;  
  ]8;id=189020866;https://docs.stripe.com/radar/rules/reference.md#post-authorization-attributesattributes]8;;. | | Address checks fail | 4000000000000010 | The address postal code check and address line 1 check both fail.              
                                                                                                                                          
  Radar might block it ]8;id=611376328;https://docs.stripe.com/radar/rules.md#traditional-bank-checksdepending on your settings.]8;; ]8;id=611376328;https://docs.stripe.com/radar/rules.md#traditional-bank-checkshttps://docs.stripe.com/radar/rules.md#traditional-bank-checks]8;; | | Address unavailable 
  | 4000000000000044 | The address postal code check and address line 1 check are both unavailable.                                       
                                                                                                                                          
  The payment succeeds unless you ]8;id=189020866;https://docs.stripe.com/radar/rules/reference.md#post-authorization-attributesblock it with a custom Radar rule]8;; ]8;id=189020866;https://docs.stripe.com/radar/rules/reference.md#post-authorization-attributeshttps://docs.stripe.com/radar/rules/reference.md#post-authorization-]8;;  
  ]8;id=189020866;https://docs.stripe.com/radar/rules/reference.md#post-authorization-attributesattributes]8;;. |                                                                                                                           
                                                                                                                                          
  #### PaymentMethods                                                                                                                     
                                                                                                                                          
   Description                                 | PaymentMethod                              | Details                                     
  ---------------------------------------------|--------------------------------------------|---------------------------------------------
   Always blocked                              | pm_card_radarBlock                         | The charge has a ]8;id=4260339296;https://docs.stripe.com/radar/transaction-risk-prevention.md#high-riskrisk level of “highest”[1]]8;; 
                                                                                                                                          
  [1]: risk level of “highest” ]8;id=4260339296;https://docs.stripe.com/radar/transaction-risk-prevention.md#high-riskhttps://docs.stripe.com/radar/transaction-risk-prevention.md#high-risk]8;;                                     
                                                                                                                                          
  Radar always blocks it. | | Highest risk | pm_card_riskLevelHighest | The charge has a ]8;id=4260339296;https://docs.stripe.com/radar/transaction-risk-prevention.md#high-riskrisk level of “highest”]8;;                          
  ]8;id=4260339296;https://docs.stripe.com/radar/transaction-risk-prevention.md#high-riskhttps://docs.stripe.com/radar/transaction-risk-prevention.md#high-risk]8;;                                                                  
                                                                                                                                          
  Radar might block it depending on your settings. | | Elevated risk | pm_card_riskLevelElevated | The charge has a ]8;id=4275739438;https://docs.stripe.com/radar/transaction-risk-prevention.md#elevated-riskrisk level of]8;;         
  ]8;id=4275739438;https://docs.stripe.com/radar/transaction-risk-prevention.md#elevated-risk“elevated”]8;; ]8;id=4275739438;https://docs.stripe.com/radar/transaction-risk-prevention.md#elevated-riskhttps://docs.stripe.com/radar/transaction-risk-prevention.md#elevated-risk]8;;                                                   
                                                                                                                                          
  Radar might ]8;id=579864162;https://docs.stripe.com/radar/transaction-reviews.mdqueue it for review]8;; ]8;id=579864162;https://docs.stripe.com/radar/transaction-reviews.mdhttps://docs.stripe.com/radar/transaction-reviews.md]8;;. | | High fraud dispute score |                    
  pm_card_highFraudDisputeScore | This charge has a high fraud dispute score.                                                             
                                                                                                                                          
  Radar might block it ]8;id=2591453743;https://docs.stripe.com/radar/risk-settings.mddepending on your settings]8;; ]8;id=2591453743;https://docs.stripe.com/radar/risk-settings.mdhttps://docs.stripe.com/radar/risk-settings.md]8;;. | | High early fraud warning score |    
  pm_card_highEfwScore | This charge has a high early fraud warning score.                                                                
                                                                                                                                          
  Radar might block it ]8;id=2591453743;https://docs.stripe.com/radar/risk-settings.mddepending on your settings]8;; ]8;id=2591453743;https://docs.stripe.com/radar/risk-settings.mdhttps://docs.stripe.com/radar/risk-settings.md]8;;. | | Dynamic risk thresholds |           
  pm_card_radarDynamicRiskThreshold | This charge triggers the Radar Dynamic risk thresholds control, when enabled.                       
                                                                                                                                          
  Radar blocks the transaction if you enable the ]8;id=1445405786;https://docs.stripe.com/radar/risk-settings.md#dynamic-risk-thresholdsDynamic risk thresholds]8;; ]8;id=1445405786;https://docs.stripe.com/radar/risk-settings.md#dynamic-risk-thresholdshttps://docs.stripe.com/radar/risk-settings.md#dynamic-risk-]8;;     
  ]8;id=1445405786;https://docs.stripe.com/radar/risk-settings.md#dynamic-risk-thresholdsthresholds]8;;. | | Free trial abuse | pm_card_freeTrialAbuseBlock | This charge triggers the Radar free trial abuse risk control, when     
  enabled.                                                                                                                                
                                                                                                                                          
  Radar blocks the transaction if you enable the ]8;id=2591453743;https://docs.stripe.com/radar/risk-settings.mdfree trial abuse risk control]8;; ]8;id=2591453743;https://docs.stripe.com/radar/risk-settings.mdhttps://docs.stripe.com/radar/risk-settings.md]8;;. | |        
  Adaptive 3DS | pm_card_adaptive3dsChallenge | This charge triggers the Radar Adaptive 3DS risk control, when enabled.                   
                                                                                                                                          
  If you enable Adaptive 3DS, Radar requests 3DS authentication when using this test card. | | CVC check fails | pm_card_cvcCheckFail | If
  you provide a CVC number, the CVC check fails.                                                                                          
                                                                                                                                          
  Radar might block it ]8;id=611376328;https://docs.stripe.com/radar/rules.md#traditional-bank-checksdepending on your settings.]8;; ]8;id=611376328;https://docs.stripe.com/radar/rules.md#traditional-bank-checkshttps://docs.stripe.com/radar/rules.md#traditional-bank-checks]8;; | | Postal code check   
  fails | pm_card_avsZipFail | If you provide a postal code, the postal code check fails.                                                 
                                                                                                                                          
  Radar might block it ]8;id=611376328;https://docs.stripe.com/radar/rules.md#traditional-bank-checksdepending on your settings.]8;; ]8;id=611376328;https://docs.stripe.com/radar/rules.md#traditional-bank-checkshttps://docs.stripe.com/radar/rules.md#traditional-bank-checks]8;; | | CVC check fails with
  elevated risk | pm_card_cvcCheckFailElevatedRisk | If you provide a CVC number, the CVC check fails with a ]8;id=4275739438;https://docs.stripe.com/radar/transaction-risk-prevention.md#elevated-riskrisk level of “elevated”]8;;     
  ]8;id=4275739438;https://docs.stripe.com/radar/transaction-risk-prevention.md#elevated-riskhttps://docs.stripe.com/radar/transaction-risk-prevention.md#elevated-risk]8;;                                                              
                                                                                                                                          
  Radar might block it ]8;id=611376328;https://docs.stripe.com/radar/rules.md#traditional-bank-checksdepending on your settings]8;; ]8;id=611376328;https://docs.stripe.com/radar/rules.md#traditional-bank-checkshttps://docs.stripe.com/radar/rules.md#traditional-bank-checks]8;;. | | Postal code check   
  fails with elevated risk | pm_card_avsZipFailElevatedRisk | If you provide a postal code, the postal code check fails with a ]8;id=4275739438;https://docs.stripe.com/radar/transaction-risk-prevention.md#elevated-riskrisk level]8;; 
  ]8;id=4275739438;https://docs.stripe.com/radar/transaction-risk-prevention.md#elevated-riskof “elevated”]8;; ]8;id=4275739438;https://docs.stripe.com/radar/transaction-risk-prevention.md#elevated-riskhttps://docs.stripe.com/radar/transaction-risk-prevention.md#elevated-risk]8;;                                                
                                                                                                                                          
  Radar might block it ]8;id=611376328;https://docs.stripe.com/radar/rules.md#traditional-bank-checksdepending on your settings]8;; ]8;id=611376328;https://docs.stripe.com/radar/rules.md#traditional-bank-checkshttps://docs.stripe.com/radar/rules.md#traditional-bank-checks]8;;. | | Line1 check fails | 
  pm_card_avsLine1Fail | The address line 1 check fails.                                                                                  
                                                                                                                                          
  The payment succeeds unless you ]8;id=189020866;https://docs.stripe.com/radar/rules/reference.md#post-authorization-attributesblock it with a custom Radar rule]8;; ]8;id=189020866;https://docs.stripe.com/radar/rules/reference.md#post-authorization-attributeshttps://docs.stripe.com/radar/rules/reference.md#post-authorization-]8;;  
  ]8;id=189020866;https://docs.stripe.com/radar/rules/reference.md#post-authorization-attributesattributes]8;;. | | Address checks fail | pm_card_avsFail | The address postal code check and address line 1 check both fail.               
                                                                                                                                          
  Radar might block it ]8;id=611376328;https://docs.stripe.com/radar/rules.md#traditional-bank-checksdepending on your settings.]8;; ]8;id=611376328;https://docs.stripe.com/radar/rules.md#traditional-bank-checkshttps://docs.stripe.com/radar/rules.md#traditional-bank-checks]8;; | | Address unavailable 
  | pm_card_avsUnchecked | The address postal code check and address line 1 check are both unavailable.                                   
                                                                                                                                          
  The payment succeeds unless you ]8;id=189020866;https://docs.stripe.com/radar/rules/reference.md#post-authorization-attributesblock it with a custom Radar rule]8;; ]8;id=189020866;https://docs.stripe.com/radar/rules/reference.md#post-authorization-attributeshttps://docs.stripe.com/radar/rules/reference.md#post-authorization-]8;;  
  ]8;id=189020866;https://docs.stripe.com/radar/rules/reference.md#post-authorization-attributesattributes]8;;. |                                                                                                                           
                                                                                                                                          
  #### Tokens                                                                                                                             
                                                                                                                                          
  Most integrations don’t use tokens anymore, but we make test tokens such as ]8;id=1684347029;https://docs.stripe.com/testing.md?testing-method=tokens#visatok_]8;;]8;id=1684347029;https://docs.stripe.com/testing.md?testing-method=tokens#visavisa]8;; ]8;id=1684347029;https://docs.stripe.com/testing.md?testing-method=tokens#visahttps://docs.stripe.com/testing.md?testing-]8;;        
  ]8;id=1684347029;https://docs.stripe.com/testing.md?testing-method=tokens#visamethod=tokens#visa]8;; available if you need them.                                                                                          
                                                                                                                                          
   Description                                 | Token                                      | Details                                     
  ---------------------------------------------|--------------------------------------------|---------------------------------------------
   Always blocked                              | tok_radarBlock                             | The charge has a ]8;id=4260339296;https://docs.stripe.com/radar/transaction-risk-prevention.md#high-riskrisk level of “highest”[1]]8;; 
                                                                                                                                          
  [1]: risk level of “highest” ]8;id=4260339296;https://docs.stripe.com/radar/transaction-risk-prevention.md#high-riskhttps://docs.stripe.com/radar/transaction-risk-prevention.md#high-risk]8;;                                     
                                                                                                                                          
  Radar always blocks it. | | Highest risk | tok_riskLevelHighest | The charge has a ]8;id=4260339296;https://docs.stripe.com/radar/transaction-risk-prevention.md#high-riskrisk level of “highest”]8;;                              
  ]8;id=4260339296;https://docs.stripe.com/radar/transaction-risk-prevention.md#high-riskhttps://docs.stripe.com/radar/transaction-risk-prevention.md#high-risk]8;;                                                                  
                                                                                                                                          
  Radar might block it depending on your settings. | | Elevated risk | tok_riskLevelElevated | The charge has a ]8;id=4275739438;https://docs.stripe.com/radar/transaction-risk-prevention.md#elevated-riskrisk level of “elevated”]8;;  
  ]8;id=4275739438;https://docs.stripe.com/radar/transaction-risk-prevention.md#elevated-riskhttps://docs.stripe.com/radar/transaction-risk-prevention.md#elevated-risk]8;;                                                              
                                                                                                                                          
  Radar might ]8;id=579864162;https://docs.stripe.com/radar/transaction-reviews.mdqueue it for review]8;; ]8;id=579864162;https://docs.stripe.com/radar/transaction-reviews.mdhttps://docs.stripe.com/radar/transaction-reviews.md]8;;. | | High fraud dispute score |                    
  tok_highFraudDisputeScore | This charge has a high fraud dispute score.                                                                 
                                                                                                                                          
  Radar might block it ]8;id=2591453743;https://docs.stripe.com/radar/risk-settings.mddepending on your settings]8;; ]8;id=2591453743;https://docs.stripe.com/radar/risk-settings.mdhttps://docs.stripe.com/radar/risk-settings.md]8;;. | | High early fraud warning score |    
  tok_highEfwScore | This charge has a high early fraud warning score.                                                                    
                                                                                                                                          
  Radar might block it ]8;id=2591453743;https://docs.stripe.com/radar/risk-settings.mddepending on your settings]8;; ]8;id=2591453743;https://docs.stripe.com/radar/risk-settings.mdhttps://docs.stripe.com/radar/risk-settings.md]8;;. | | Dynamic risk thresholds |           
  tok_radarDynamicRiskThreshold | This charge triggers the Radar Dynamic risk thresholds control, when enabled.                           
                                                                                                                                          
  Radar blocks the transaction if you enable the ]8;id=1445405786;https://docs.stripe.com/radar/risk-settings.md#dynamic-risk-thresholdsDynamic risk thresholds]8;; ]8;id=1445405786;https://docs.stripe.com/radar/risk-settings.md#dynamic-risk-thresholdshttps://docs.stripe.com/radar/risk-settings.md#dynamic-risk-]8;;     
  ]8;id=1445405786;https://docs.stripe.com/radar/risk-settings.md#dynamic-risk-thresholdsthresholds]8;;. | | Free trial abuse | tok_freeTrialAbuseBlock | This charge triggers the Radar free trial abuse risk control, when enabled.
                                                                                                                                          
  Radar blocks the transaction if you enable the ]8;id=2591453743;https://docs.stripe.com/radar/risk-settings.mdfree trial abuse risk control]8;; ]8;id=2591453743;https://docs.stripe.com/radar/risk-settings.mdhttps://docs.stripe.com/radar/risk-settings.md]8;;. | |        
  Adaptive 3DS | tok_adaptive3dsChallenge | This charge triggers the Radar Adaptive 3DS risk control, when enabled.                       
                                                                                                                                          
  If you enable Adaptive 3DS, Radar requests 3DS authentication when using this test card. | | CVC check fails | tok_cvcCheckFail | If you
  provide a CVC number, the CVC check fails.                                                                                              
                                                                                                                                          
  Radar might block it ]8;id=611376328;https://docs.stripe.com/radar/rules.md#traditional-bank-checksdepending on your settings.]8;; ]8;id=611376328;https://docs.stripe.com/radar/rules.md#traditional-bank-checkshttps://docs.stripe.com/radar/rules.md#traditional-bank-checks]8;; | | Postal code check   
  fails | tok_avsZipFail | If you provide a postal code, the postal code check fails.                                                     
                                                                                                                                          
  Radar might block it ]8;id=611376328;https://docs.stripe.com/radar/rules.md#traditional-bank-checksdepending on your settings.]8;; ]8;id=611376328;https://docs.stripe.com/radar/rules.md#traditional-bank-checkshttps://docs.stripe.com/radar/rules.md#traditional-bank-checks]8;; | | CVC check fails with
  elevated risk | tok_cvcCheckFailElevatedRisk | If you provide a CVC number, the CVC check fails with a ]8;id=4275739438;https://docs.stripe.com/radar/transaction-risk-prevention.md#elevated-riskrisk level of “elevated”]8;;         
  ]8;id=4275739438;https://docs.stripe.com/radar/transaction-risk-prevention.md#elevated-riskhttps://docs.stripe.com/radar/transaction-risk-prevention.md#elevated-risk]8;;                                                              
                                                                                                                                          
  Radar might block it ]8;id=611376328;https://docs.stripe.com/radar/rules.md#traditional-bank-checksdepending on your settings]8;; ]8;id=611376328;https://docs.stripe.com/radar/rules.md#traditional-bank-checkshttps://docs.stripe.com/radar/rules.md#traditional-bank-checks]8;;. | | Postal code check   
  fails with elevated risk | tok_avsZipFailElevatedRisk | If you provide a postal code, the postal code check fails with a ]8;id=4275739438;https://docs.stripe.com/radar/transaction-risk-prevention.md#elevated-riskrisk level of]8;;  
  ]8;id=4275739438;https://docs.stripe.com/radar/transaction-risk-prevention.md#elevated-risk“elevated”]8;; ]8;id=4275739438;https://docs.stripe.com/radar/transaction-risk-prevention.md#elevated-riskhttps://docs.stripe.com/radar/transaction-risk-prevention.md#elevated-risk]8;;                                                   
                                                                                                                                          
  Radar might block it ]8;id=611376328;https://docs.stripe.com/radar/rules.md#traditional-bank-checksdepending on your settings]8;; ]8;id=611376328;https://docs.stripe.com/radar/rules.md#traditional-bank-checkshttps://docs.stripe.com/radar/rules.md#traditional-bank-checks]8;;. | | Line1 check fails | 
  tok_avsLine1Fail | The address line 1 check fails.                                                                                      
                                                                                                                                          
  The payment succeeds unless you ]8;id=189020866;https://docs.stripe.com/radar/rules/reference.md#post-authorization-attributesblock it with a custom Radar rule]8;; ]8;id=189020866;https://docs.stripe.com/radar/rules/reference.md#post-authorization-attributeshttps://docs.stripe.com/radar/rules/reference.md#post-authorization-]8;;  
  ]8;id=189020866;https://docs.stripe.com/radar/rules/reference.md#post-authorization-attributesattributes]8;;. | | Address checks fail | tok_avsFail | The address postal code check and address line 1 check both fail.                   
                                                                                                                                          
  Radar might block it ]8;id=611376328;https://docs.stripe.com/radar/rules.md#traditional-bank-checksdepending on your settings.]8;; ]8;id=611376328;https://docs.stripe.com/radar/rules.md#traditional-bank-checkshttps://docs.stripe.com/radar/rules.md#traditional-bank-checks]8;; | | Address unavailable 
  | tok_avsUnchecked | The address postal code check and address line 1 check are both unavailable.                                       
                                                                                                                                          
  The payment succeeds unless you ]8;id=189020866;https://docs.stripe.com/radar/rules/reference.md#post-authorization-attributesblock it with a custom Radar rule]8;; ]8;id=189020866;https://docs.stripe.com/radar/rules/reference.md#post-authorization-attributeshttps://docs.stripe.com/radar/rules/reference.md#post-authorization-]8;;  
  ]8;id=189020866;https://docs.stripe.com/radar/rules/reference.md#post-authorization-attributesattributes]8;;. |                                                                                                                           
                                                                                                                                          
  ## Trigger an error with invalid data                                                                                                   
                                                                                                                                          
  To test errors resulting from invalid data, provide invalid details. You don’t need a special test card for this. Any invalid value     
  works. For instance:                                                                                                                    
                                                                                                                                          
  • ]8;id=1335950992;https://docs.stripe.com/declines/codes.md#invalid_expiry_monthinvalid_]8;;]8;id=1335950992;https://docs.stripe.com/declines/codes.md#invalid_expiry_monthexpiry_]8;;]8;id=1335950992;https://docs.stripe.com/declines/codes.md#invalid_expiry_monthmonth]8;; ]8;id=1335950992;https://docs.stripe.com/declines/codes.md#invalid_expiry_monthhttps://docs.stripe.com/declines/codes.md#invalid_expiry_month]8;;: Use an invalid month, such as **13**.            
  • ]8;id=3452166187;https://docs.stripe.com/declines/codes.md#invalid_expiry_yearinvalid_]8;;]8;id=3452166187;https://docs.stripe.com/declines/codes.md#invalid_expiry_yearexpiry_]8;;]8;id=3452166187;https://docs.stripe.com/declines/codes.md#invalid_expiry_yearyear]8;; ]8;id=3452166187;https://docs.stripe.com/declines/codes.md#invalid_expiry_yearhttps://docs.stripe.com/declines/codes.md#invalid_expiry_year]8;;: Use a year up to 50 years in the past, such as     
  **95**.                                                                                                                                 
  • ]8;id=4018430152;https://docs.stripe.com/declines/codes.md#invalid_cvcinvalid_]8;;]8;id=4018430152;https://docs.stripe.com/declines/codes.md#invalid_cvccvc]8;; ]8;id=4018430152;https://docs.stripe.com/declines/codes.md#invalid_cvchttps://docs.stripe.com/declines/codes.md#invalid_cvc]8;;: Use a two-digit number, such as **99**.                            
  • ]8;id=3935256579;https://docs.stripe.com/declines/codes.md#incorrect_numberincorrect_]8;;]8;id=3935256579;https://docs.stripe.com/declines/codes.md#incorrect_numbernumber]8;; ]8;id=3935256579;https://docs.stripe.com/declines/codes.md#incorrect_numberhttps://docs.stripe.com/declines/codes.md#incorrect_number]8;;: Use a card number that fails the ]8;id=4276710445;https://en.wikipedia.org/wiki/Luhn_algorithmLuhn check]8;; ]8;id=4276710445;https://en.wikipedia.org/wiki/Luhn_algorithmhttps://en.]8;;  
  ]8;id=4276710445;https://en.wikipedia.org/wiki/Luhn_algorithmwikipedia.org/wiki/Luhn_algorithm]8;;, such as 4242424242424241.                                                                            
                                                                                                                                          
  ## Simulate a dispute                                                                                                                   
                                                                                                                                          
  To simulate a ]8;id=987294212;https://docs.stripe.com/disputes.mddisputed transaction]8;; ]8;id=987294212;https://docs.stripe.com/disputes.mdhttps://docs.stripe.com/disputes.md]8;;, use the test cards in this section. Then, to simulate winning or
  losing the dispute, provide ]8;id=845720777;https://docs.stripe.com/testing.md#evidencewinning or losing evidence]8;; ]8;id=845720777;https://docs.stripe.com/testing.md#evidencehttps://docs.stripe.com/testing.md#evidence]8;;.                                     
                                                                                                                                          
  #### Card numbers                                                                                                                       
                                                                                                                                          
   Description                  | Number           | Details                                                                              
  ------------------------------|------------------|--------------------------------------------------------------------------------------
   Fraudulent (asynchronous)    | 4061219946393810 | Use this card for most test cases. With default account settings, the payment        
                                |                  | succeeds, and Stripe creates a ]8;id=4047792565;https://docs.stripe.com/disputes/categories.mdfraudulent[1]]8;; dispute shortly afterward, rather than  
                                |                  | during the payment request. This sequence more closely reflects live-mode behavior.  
                                |                  | This type of dispute is ]8;id=645456937;https://docs.stripe.com/payments/3d-secure/authentication-flow.md#disputed-paymentsprotected[2]]8;; after 3D Secure authentication.                 
   Fraudulent (synchronous)     | 4000000000000259 | With default account settings, payment succeeds, and Stripe creates a ]8;id=4047792565;https://docs.stripe.com/disputes/categories.mdfraudulent[1]]8;;  
                                |                  | dispute during the payment request. This type of dispute is ]8;id=645456937;https://docs.stripe.com/payments/3d-secure/authentication-flow.md#disputed-paymentsprotected[2]]8;; after 3D    
                                |                  | Secure authentication.                                                               
   Discover fraudulent          | 6026507838377928 | With default account settings, charge succeeds, but is disputed as ]8;id=4047792565;https://docs.stripe.com/disputes/categories.mdfraudulent[1]]8;;.    
   Not received                 | 4000000000002685 | With default account settings, charge succeeds, only to be disputed as ]8;id=4047792565;https://docs.stripe.com/disputes/categories.mdproduct not]8;;   
                                |                  | ]8;id=4047792565;https://docs.stripe.com/disputes/categories.mdreceived[3]]8;;. This type of dispute ]8;id=645456937;https://docs.stripe.com/payments/3d-secure/authentication-flow.md#disputed-paymentsisn’t protected[4]]8;; after 3D Secure authentication. 
   Inquiry                      | 4000000000001976 | With default account settings, charge succeeds, only to be disputed as ]8;id=1479849337;https://docs.stripe.com/disputes/how-disputes-work.md#inquiriesan]8;;            
                                |                  | ]8;id=1479849337;https://docs.stripe.com/disputes/how-disputes-work.md#inquiriesinquiry[5]]8;;.                                                                          
   Early fraud warning          | 4000000000005423 | With default account settings, charge succeeds, only to receive ]8;id=22041774;https://docs.stripe.com/disputes/how-disputes-work.md#early-fraud-warningsan early fraud]8;;       
                                |                  | ]8;id=22041774;https://docs.stripe.com/disputes/how-disputes-work.md#early-fraud-warningswarning[6]]8;;.                                                                          
   Multiple disputes            | 4000000404000079 | With default account settings, charge succeeds, only to be disputed ]8;id=906799058;https://docs.stripe.com/disputes/how-disputes-work.md#multiple-disputesmultiple]8;;         
                                |                  | ]8;id=906799058;https://docs.stripe.com/disputes/how-disputes-work.md#multiple-disputestimes[7]]8;;.                                                                            
   Visa Compelling Evidence 3.0 | 4000000404000038 | With default account settings, charge succeeds, only to be disputed as a ]8;id=63717234;https://docs.stripe.com/disputes/api/visa-ce3.md#testingVisa]8;;        
                                |                  | ]8;id=63717234;https://docs.stripe.com/disputes/api/visa-ce3.md#testingCompelling Evidence 3.0 eligible dispute[8]]8;;.                                         
   Visa compliance              | 4000008400000779 | With default account settings, charge succeeds, only to be disputed as a ]8;id=1772290226;https://docs.stripe.com/disputes/api/visa-compliance.md#testingVisa]8;;        
                                |                  | ]8;id=1772290226;https://docs.stripe.com/disputes/api/visa-compliance.md#testingcompliance dispute[9]]8;;.                                                               
   Mastercard compliance        | 5105008400000002 | With default account settings, charge succeeds, only to be disputed as a ]8;id=3365762183;https://docs.stripe.com/disputes/api/mastercard-compliance.md#testingMastercard]8;;  
                                |                  | ]8;id=3365762183;https://docs.stripe.com/disputes/api/mastercard-compliance.md#testingcompliance dispute[10]]8;;.                                                              
   Smart disputes               | 4000000001000043 | With default account settings, charge succeeds, only to be disputed as a ]8;id=713029338;https://docs.stripe.com/disputes/smart-disputes.mdSmart]8;;       
                                |                  | ]8;id=713029338;https://docs.stripe.com/disputes/smart-disputes.mdDisputes[11]]8;; eligible dispute.                                                       
                                                                                                                                          
   [1]: fraudulent ]8;id=4047792565;https://docs.stripe.com/disputes/categories.mdhttps://docs.stripe.com/disputes/categories.md]8;;                                                                         
   [2]: protected ]8;id=645456937;https://docs.stripe.com/payments/3d-secure/authentication-flow.md#disputed-paymentshttps://docs.stripe.com/payments/3d-secure/authentication-flow.md#disputed-payments]8;;                                     
   [3]: product not received ]8;id=4047792565;https://docs.stripe.com/disputes/categories.mdhttps://docs.stripe.com/disputes/categories.md]8;;                                                               
   [4]: isn’t protected ]8;id=645456937;https://docs.stripe.com/payments/3d-secure/authentication-flow.md#disputed-paymentshttps://docs.stripe.com/payments/3d-secure/authentication-flow.md#disputed-payments]8;;                               
   [5]: an inquiry ]8;id=1479849337;https://docs.stripe.com/disputes/how-disputes-work.md#inquirieshttps://docs.stripe.com/disputes/how-disputes-work.md#inquiries]8;;                                                        
   [6]: an early fraud warning ]8;id=22041774;https://docs.stripe.com/disputes/how-disputes-work.md#early-fraud-warningshttps://docs.stripe.com/disputes/how-disputes-work.md#early-fraud-warnings]8;;                                 
   [7]: multiple times ]8;id=906799058;https://docs.stripe.com/disputes/how-disputes-work.md#multiple-disputeshttps://docs.stripe.com/disputes/how-disputes-work.md#multiple-disputes]8;;                                            
   [8]: Visa Compelling Evidence 3.0 eligible dispute ]8;id=63717234;https://docs.stripe.com/disputes/api/visa-ce3.md#testinghttps://docs.stripe.com/disputes/api/visa-ce3.md#testing]8;;                            
   [9]: Visa compliance dispute ]8;id=1772290226;https://docs.stripe.com/disputes/api/visa-compliance.md#testinghttps://docs.stripe.com/disputes/api/visa-compliance.md#testing]8;;                                           
  [10]: Mastercard compliance dispute ]8;id=3365762183;https://docs.stripe.com/disputes/api/mastercard-compliance.md#testinghttps://docs.stripe.com/disputes/api/mastercard-compliance.md#testing]8;;                               
  [11]: Smart Disputes ]8;id=713029338;https://docs.stripe.com/disputes/smart-disputes.mdhttps://docs.stripe.com/disputes/smart-disputes.md]8;;                                                                 
                                                                                                                                          
  #### PaymentMethods                                                                                                                     
                                                                                                                                          
   Description                  | PaymentMethod                                | Details                                                  
  ------------------------------|----------------------------------------------|----------------------------------------------------------
   Fraudulent                   | pm_card_createDispute                        | With default account settings, charge succeeds, only to  
                                |                                              | be disputed as ]8;id=4047792565;https://docs.stripe.com/disputes/categories.mdfraudulent[1]]8;;. This type of dispute is    
                                |                                              | ]8;id=645456937;https://docs.stripe.com/payments/3d-secure/authentication-flow.md#disputed-paymentsprotected[2]]8;; after 3D Secure authentication.             
   Not received                 | pm_card_createDisputeProductNotReceived      | With default account settings, charge succeeds, only to  
                                |                                              | be disputed as ]8;id=4047792565;https://docs.stripe.com/disputes/categories.mdproduct not received[3]]8;;. This type of     
                                |                                              | dispute ]8;id=645456937;https://docs.stripe.com/payments/3d-secure/authentication-flow.md#disputed-paymentsisn’t protected[4]]8;; after 3D Secure               
                                |                                              | authentication.                                          
   Inquiry                      | pm_card_createDisputeInquiry                 | With default account settings, charge succeeds, only to  
                                |                                              | be disputed as ]8;id=1479849337;https://docs.stripe.com/disputes/how-disputes-work.md#inquiriesan inquiry[5]]8;;.                            
   Early fraud warning          | pm_card_createIssuerFraudRecord              | With default account settings, charge succeeds, only to  
                                |                                              | receive ]8;id=22041774;https://docs.stripe.com/disputes/how-disputes-work.md#early-fraud-warningsan early fraud warning[6]]8;;.                       
   Multiple disputes            | pm_card_createMultipleDisputes               | With default account settings, charge succeeds, only to  
                                |                                              | be disputed ]8;id=906799058;https://docs.stripe.com/disputes/how-disputes-work.md#multiple-disputesmultiple times[7]]8;;.                           
   Visa Compelling Evidence 3.0 | pm_card_createCe3EligibleDispute             | With default account settings, charge succeeds, only to  
                                |                                              | be disputed as a ]8;id=63717234;https://docs.stripe.com/disputes/api/visa-ce3.md#testingVisa Compelling Evidence 3.0 eligible]8;;   
                                |                                              | ]8;id=63717234;https://docs.stripe.com/disputes/api/visa-ce3.md#testingdispute[8]]8;;.                                              
   Visa compliance              | pm_card_createComplianceDispute              | With default account settings, charge succeeds, only to  
                                |                                              | be disputed as a ]8;id=1772290226;https://docs.stripe.com/disputes/api/visa-compliance.md#testingVisa compliance dispute[9]]8;;.             
   Mastercard compliance        | pm_card_createMastercardComplianceDispute    | With default account settings, the charge succeeds, only 
                                |                                              | to be disputed as a ]8;id=3365762183;https://docs.stripe.com/disputes/api/mastercard-compliance.md#testingMastercard compliance dispute[10]]8;;.   
   Smart disputes               | pm_card_createAutoRepresentmentEligibleDispu | With default account settings, charge succeeds, only to  
                                | te                                           | be disputed as a ]8;id=713029338;https://docs.stripe.com/disputes/smart-disputes.mdSmart Disputes[11]]8;; eligible dispute.    
                                                                                                                                          
   [1]: fraudulent ]8;id=4047792565;https://docs.stripe.com/disputes/categories.mdhttps://docs.stripe.com/disputes/categories.md]8;;                                                                         
   [2]: protected ]8;id=645456937;https://docs.stripe.com/payments/3d-secure/authentication-flow.md#disputed-paymentshttps://docs.stripe.com/payments/3d-secure/authentication-flow.md#disputed-payments]8;;                                     
   [3]: product not received ]8;id=4047792565;https://docs.stripe.com/disputes/categories.mdhttps://docs.stripe.com/disputes/categories.md]8;;                                                               
   [4]: isn’t protected ]8;id=645456937;https://docs.stripe.com/payments/3d-secure/authentication-flow.md#disputed-paymentshttps://docs.stripe.com/payments/3d-secure/authentication-flow.md#disputed-payments]8;;                               
   [5]: an inquiry ]8;id=1479849337;https://docs.stripe.com/disputes/how-disputes-work.md#inquirieshttps://docs.stripe.com/disputes/how-disputes-work.md#inquiries]8;;                                                        
   [6]: an early fraud warning ]8;id=22041774;https://docs.stripe.com/disputes/how-disputes-work.md#early-fraud-warningshttps://docs.stripe.com/disputes/how-disputes-work.md#early-fraud-warnings]8;;                                 
   [7]: multiple times ]8;id=906799058;https://docs.stripe.com/disputes/how-disputes-work.md#multiple-disputeshttps://docs.stripe.com/disputes/how-disputes-work.md#multiple-disputes]8;;                                            
   [8]: Visa Compelling Evidence 3.0 eligible dispute ]8;id=63717234;https://docs.stripe.com/disputes/api/visa-ce3.md#testinghttps://docs.stripe.com/disputes/api/visa-ce3.md#testing]8;;                            
   [9]: Visa compliance dispute ]8;id=1772290226;https://docs.stripe.com/disputes/api/visa-compliance.md#testinghttps://docs.stripe.com/disputes/api/visa-compliance.md#testing]8;;                                           
  [10]: Mastercard compliance dispute ]8;id=3365762183;https://docs.stripe.com/disputes/api/mastercard-compliance.md#testinghttps://docs.stripe.com/disputes/api/mastercard-compliance.md#testing]8;;                               
  [11]: Smart Disputes ]8;id=713029338;https://docs.stripe.com/disputes/smart-disputes.mdhttps://docs.stripe.com/disputes/smart-disputes.md]8;;                                                                 
                                                                                                                                          
  #### Tokens                                                                                                                             
                                                                                                                                          
  Most integrations don’t use tokens anymore, but we make test tokens such as ]8;id=1684347029;https://docs.stripe.com/testing.md?testing-method=tokens#visatok_]8;;]8;id=1684347029;https://docs.stripe.com/testing.md?testing-method=tokens#visavisa]8;; ]8;id=1684347029;https://docs.stripe.com/testing.md?testing-method=tokens#visahttps://docs.stripe.com/testing.md?testing-]8;;        
  ]8;id=1684347029;https://docs.stripe.com/testing.md?testing-method=tokens#visamethod=tokens#visa]8;; available if you need them.                                                                                          
                                                                                                                                          
   Description                  | Token                                    | Details                                                      
  ------------------------------|------------------------------------------|--------------------------------------------------------------
   Fraudulent                   | tok_createDispute                        | With default account settings, charge succeeds, only to be   
                                |                                          | disputed as ]8;id=4047792565;https://docs.stripe.com/disputes/categories.mdfraudulent[1]]8;;. This type of dispute is           
                                |                                          | ]8;id=645456937;https://docs.stripe.com/payments/3d-secure/authentication-flow.md#disputed-paymentsprotected[2]]8;; after 3D Secure authentication.                 
   Not received                 | tok_createDisputeProductNotReceived      | With default account settings, charge succeeds, only to be   
                                |                                          | disputed as ]8;id=4047792565;https://docs.stripe.com/disputes/categories.mdproduct not received[3]]8;;. This type of dispute    
                                |                                          | ]8;id=645456937;https://docs.stripe.com/payments/3d-secure/authentication-flow.md#disputed-paymentsisn’t protected[4]]8;; after 3D Secure authentication.           
   Inquiry                      | tok_createDisputeInquiry                 | With default account settings, charge succeeds, only to be   
                                |                                          | disputed as ]8;id=1479849337;https://docs.stripe.com/disputes/how-disputes-work.md#inquiriesan inquiry[5]]8;;.                                   
   Early fraud warning          | tok_createIssuerFraudRecord              | With default account settings, charge succeeds, only to      
                                |                                          | receive ]8;id=22041774;https://docs.stripe.com/disputes/how-disputes-work.md#early-fraud-warningsan early fraud warning[6]]8;;.                           
   Multiple disputes            | tok_createMultipleDisputes               | With default account settings, charge succeeds, only to be   
                                |                                          | disputed ]8;id=906799058;https://docs.stripe.com/disputes/how-disputes-work.md#multiple-disputesmultiple times[7]]8;;.                                  
   Visa Compelling Evidence 3.0 | tok_createCe3EligibleDispute             | With default account settings, charge succeeds, only to be   
                                |                                          | disputed as a ]8;id=63717234;https://docs.stripe.com/disputes/api/visa-ce3.md#testingVisa Compelling Evidence 3.0 eligible]8;;          
                                |                                          | ]8;id=63717234;https://docs.stripe.com/disputes/api/visa-ce3.md#testingdispute[8]]8;;.                                                  
   Visa compliance              | tok_createComplianceDispute              | With default account settings, charge succeeds, only to be   
                                |                                          | disputed as a ]8;id=1772290226;https://docs.stripe.com/disputes/api/visa-compliance.md#testingVisa compliance dispute[9]]8;;.                    
   Mastercard compliance        | tok_createMastercardComplianceDispute    | With default account settings, the charge succeeds, only to  
                                |                                          | be disputed as a ]8;id=3365762183;https://docs.stripe.com/disputes/api/mastercard-compliance.md#testingMastercard compliance dispute[10]]8;;.          
   Smart disputes               | tok_createAutoRepresentmentEligibleDispu | With default account settings, charge succeeds, only to be   
                                | te                                       | disputed as a ]8;id=713029338;https://docs.stripe.com/disputes/smart-disputes.mdSmart Disputes[11]]8;; eligible dispute.           
                                                                                                                                          
   [1]: fraudulent ]8;id=4047792565;https://docs.stripe.com/disputes/categories.mdhttps://docs.stripe.com/disputes/categories.md]8;;                                                                         
   [2]: protected ]8;id=645456937;https://docs.stripe.com/payments/3d-secure/authentication-flow.md#disputed-paymentshttps://docs.stripe.com/payments/3d-secure/authentication-flow.md#disputed-payments]8;;                                     
   [3]: product not received ]8;id=4047792565;https://docs.stripe.com/disputes/categories.mdhttps://docs.stripe.com/disputes/categories.md]8;;                                                               
   [4]: isn’t protected ]8;id=645456937;https://docs.stripe.com/payments/3d-secure/authentication-flow.md#disputed-paymentshttps://docs.stripe.com/payments/3d-secure/authentication-flow.md#disputed-payments]8;;                               
   [5]: an inquiry ]8;id=1479849337;https://docs.stripe.com/disputes/how-disputes-work.md#inquirieshttps://docs.stripe.com/disputes/how-disputes-work.md#inquiries]8;;                                                        
   [6]: an early fraud warning ]8;id=22041774;https://docs.stripe.com/disputes/how-disputes-work.md#early-fraud-warningshttps://docs.stripe.com/disputes/how-disputes-work.md#early-fraud-warnings]8;;                                 
   [7]: multiple times ]8;id=906799058;https://docs.stripe.com/disputes/how-disputes-work.md#multiple-disputeshttps://docs.stripe.com/disputes/how-disputes-work.md#multiple-disputes]8;;                                            
   [8]: Visa Compelling Evidence 3.0 eligible dispute ]8;id=63717234;https://docs.stripe.com/disputes/api/visa-ce3.md#testinghttps://docs.stripe.com/disputes/api/visa-ce3.md#testing]8;;                            
   [9]: Visa compliance dispute ]8;id=1772290226;https://docs.stripe.com/disputes/api/visa-compliance.md#testinghttps://docs.stripe.com/disputes/api/visa-compliance.md#testing]8;;                                           
  [10]: Mastercard compliance dispute ]8;id=3365762183;https://docs.stripe.com/disputes/api/mastercard-compliance.md#testinghttps://docs.stripe.com/disputes/api/mastercard-compliance.md#testing]8;;                               
  [11]: Smart Disputes ]8;id=713029338;https://docs.stripe.com/disputes/smart-disputes.mdhttps://docs.stripe.com/disputes/smart-disputes.md]8;;                                                                 
                                                                                                                                          
  ### Evidence                                                                                                                            
                                                                                                                                          
  To simulate winning or losing the dispute, respond with one of the evidence values from the table below.                                
                                                                                                                                          
  • If you ]8;id=1371478481;https://docs.stripe.com/disputes/api.mdrespond using the API]8;; ]8;id=1371478481;https://docs.stripe.com/disputes/api.mdhttps://docs.stripe.com/disputes/api.md]8;;, pass the value from the table as ]8;id=3057017935;https://docs.stripe.com/api/disputes/update.md#update_dispute-evidence-uncategorized_textuncategorized_]8;;]8;id=3057017935;https://docs.stripe.com/api/disputes/update.md#update_dispute-evidence-uncategorized_texttext]8;;             
  ]8;id=3057017935;https://docs.stripe.com/api/disputes/update.md#update_dispute-evidence-uncategorized_texthttps://docs.stripe.com/api/disputes/update.md#update_dispute-evidence-uncategorized_text]8;;.                                              
  • If you ]8;id=1627281824;https://docs.stripe.com/disputes/responding.mdrespond in the Dashboard]8;; ]8;id=1627281824;https://docs.stripe.com/disputes/responding.mdhttps://docs.stripe.com/disputes/responding.md]8;; or in ]8;id=2020030607;https://docs.stripe.com/connect/supported-embedded-components/disputes-list.mdConnect embedded components]8;; ]8;id=2020030607;https://docs.stripe.com/connect/supported-embedded-components/disputes-list.mdhttps://docs.stripe.]8;; 
  ]8;id=2020030607;https://docs.stripe.com/connect/supported-embedded-components/disputes-list.mdcom/connect/supported-embedded-components/disputes-list.md]8;;, enter the value from the table in the **Additional information** field. Then,
  click **Submit evidence**.                                                                                                              
                                                                                                                                          
   Evidence                  | Description                                                                                                
  ---------------------------|------------------------------------------------------------------------------------------------------------
   winning_evidence          | Closes the dispute as won and credits your account for the amount of the charge and related fees.          
   losing_evidence           | Closes the dispute as lost without crediting your account. For inquiries, this closes the inquiry without  
                             | escalation.                                                                                                
   escalate_inquiry_evidence | Escalates the inquiry to a chargeback. This transitions the inquiry to a full dispute and debits your      
                             | account for the amount of the dispute and related fees.                                                    
                                                                                                                                          
  ### Dispute prevention                                                                                                                  
                                                                                                                                          
  ]8;id=2222462029;https://docs.stripe.com/disputes/prevention.mdDispute prevention]8;; ]8;id=2222462029;https://docs.stripe.com/disputes/prevention.mdhttps://docs.stripe.com/disputes/prevention.md]8;; helps resolve or block disputes before they become chargebacks. To    
  simulate prevented disputes in test mode, use the test cards in this section. If your account has ]8;id=150101062;https://dashboard.stripe.com/settings/disputesDispute Resolution or Dispute]8;;         
  ]8;id=150101062;https://dashboard.stripe.com/settings/disputesDeflection]8;; ]8;id=150101062;https://dashboard.stripe.com/settings/disputeshttps://dashboard.stripe.com/settings/disputes]8;; enabled, the dispute on the transaction is either blocked or resolved.        
  Otherwise, the transaction is successfully disputed.                                                                                    
                                                                                                                                          
  #### Card numbers                                                                                                                       
                                                                                                                                          
   Description                   | Number           | Details                                                                             
  -------------------------------|------------------|-------------------------------------------------------------------------------------
   Visa Rapid Dispute Resolution | 4000000404004816 | Charge succeeds, then Visa RDR prevents the dispute if the account is enrolled in   
                                 |                  | Dispute Resolution. Otherwise, creates a dispute.                                   
   Verifi CE3 block              | 4000000404005649 | Charge succeeds, then Compelling Evidence 3.0 blocks the dispute if the account is  
                                 |                  | enrolled in Dispute Deflection. Otherwise, creates a dispute.                       
   Ethoca alert                  | 5105000300000018 | Charge succeeds, then Ethoca Alerts prevents the dispute if the account is enrolled 
                                 |                  | in Dispute Resolution. Otherwise, creates a dispute.                                
                                                                                                                                          
  #### PaymentMethods                                                                                                                     
                                                                                                                                          
   Description                   | PaymentMethod                              | Details                                                   
  -------------------------------|--------------------------------------------|-----------------------------------------------------------
   Visa Rapid Dispute Resolution | pm_card_createRapidDisputeResolutionDisput | Charge succeeds, then Visa RDR prevents the dispute if    
                                 | e                                          | the account is enrolled in Dispute Resolution. Otherwise, 
                                 |                                            | creates a dispute.                                        
   Verifi CE3 block              | pm_card_createCe3BlockDispute              | Charge succeeds, then Compelling Evidence 3.0 blocks the  
                                 |                                            | dispute if the account is enrolled in Dispute Deflection. 
                                 |                                            | Otherwise, creates a dispute.                             
   Ethoca alert                  | pm_card_createEthocaAlert                  | Charge succeeds, then Ethoca Alerts prevents the dispute  
                                 |                                            | if the account is enrolled in Dispute Resolution.         
                                 |                                            | Otherwise, creates a dispute.                             
                                                                                                                                          
  #### Tokens                                                                                                                             
                                                                                                                                          
  Most integrations don’t use tokens anymore, but we make test tokens such as ]8;id=1684347029;https://docs.stripe.com/testing.md?testing-method=tokens#visatok_]8;;]8;id=1684347029;https://docs.stripe.com/testing.md?testing-method=tokens#visavisa]8;; ]8;id=1684347029;https://docs.stripe.com/testing.md?testing-method=tokens#visahttps://docs.stripe.com/testing.md?testing-]8;;        
  ]8;id=1684347029;https://docs.stripe.com/testing.md?testing-method=tokens#visamethod=tokens#visa]8;; available if you need them.                                                                                          
                                                                                                                                          
   Description                   | Token                                  | Details                                                       
  -------------------------------|----------------------------------------|---------------------------------------------------------------
   Visa Rapid Dispute Resolution | tok_createRapidDisputeResolutionDisput | Charge succeeds, then Visa RDR prevents the dispute if the    
                                 | e                                      | account is enrolled in Dispute Resolution. Otherwise, creates 
                                 |                                        | a dispute.                                                    
   Verifi CE3 block              | tok_createCe3BlockDispute              | Charge succeeds, then Compelling Evidence 3.0 blocks the      
                                 |                                        | dispute if the account is enrolled in Dispute Deflection.     
                                 |                                        | Otherwise, creates a dispute.                                 
   Ethoca alert                  | tok_createEthocaAlert                  | Charge succeeds, then Ethoca Alerts prevents the dispute if   
                                 |                                        | the account is enrolled in Dispute Resolution. Otherwise,     
                                 |                                        | creates a dispute.                                            
                                                                                                                                          
  ## Simulate an asynchronous refund                                                                                                      
                                                                                                                                          
  In live mode, refunds are asynchronous: a refund can appear to succeed and later fail, or can appear as pending at first and later      
  succeed. To simulate refunds with those behaviors, use the test cards in this section. With all other test cards, refunds succeed       
  immediately and don’t change status after that.                                                                                         
                                                                                                                                          
  #### Card numbers                                                                                                                       
                                                                                                                                          
   Description          | Number           | Details                                                                                      
  ----------------------|------------------|----------------------------------------------------------------------------------------------
   Asynchronous success | 4000000000007726 | The charge succeeds. If you initiate a refund, its status begins as pending. Some time       
                        |                  | later, its status transitions to succeeded and sends a refund.updated ]8;id=1345380568;https://docs.stripe.com/api/events/types.md#event_types-refund.updatedevent[1]]8;;.              
   Asynchronous failure | 4000000000005126 | The charge succeeds. If you initiate a refund, its status begins as succeeded. Some time     
                        |                  | later, its status transitions to failed and sends a refund.failed ]8;id=2047207500;https://docs.stripe.com/api/events/types.md#event_types-refund.failedevent[2]]8;;.                  
                                                                                                                                          
  [1]: event ]8;id=1345380568;https://docs.stripe.com/api/events/types.md#event_types-refund.updatedhttps://docs.stripe.com/api/events/types.md#event_types-refund.updated]8;;                                                       
  [2]: event ]8;id=2047207500;https://docs.stripe.com/api/events/types.md#event_types-refund.failedhttps://docs.stripe.com/api/events/types.md#event_types-refund.failed]8;;                                                        
                                                                                                                                          
  #### PaymentMethods                                                                                                                     
                                                                                                                                          
   Description          | PaymentMethod         | Details                                                                                 
  ----------------------|-----------------------|-----------------------------------------------------------------------------------------
   Asynchronous success | pm_card_pendingRefund | The charge succeeds. If you initiate a refund, its status begins as pending. Some time  
                        |                       | later, its status transitions to succeeded and sends a refund.updated ]8;id=1345380568;https://docs.stripe.com/api/events/types.md#event_types-refund.updatedevent[1]]8;;.         
   Asynchronous failure | pm_card_refundFail    | The charge succeeds. If you initiate a refund, its status begins as succeeded. Some     
                        |                       | time later, its status transitions to failed and sends a refund.failed ]8;id=2047207500;https://docs.stripe.com/api/events/types.md#event_types-refund.failedevent[2]]8;;.        
                                                                                                                                          
  [1]: event ]8;id=1345380568;https://docs.stripe.com/api/events/types.md#event_types-refund.updatedhttps://docs.stripe.com/api/events/types.md#event_types-refund.updated]8;;                                                       
  [2]: event ]8;id=2047207500;https://docs.stripe.com/api/events/types.md#event_types-refund.failedhttps://docs.stripe.com/api/events/types.md#event_types-refund.failed]8;;                                                        
                                                                                                                                          
  #### Tokens                                                                                                                             
                                                                                                                                          
  Most integrations don’t use tokens anymore, but we make test tokens such as ]8;id=1684347029;https://docs.stripe.com/testing.md?testing-method=tokens#visatok_]8;;]8;id=1684347029;https://docs.stripe.com/testing.md?testing-method=tokens#visavisa]8;; ]8;id=1684347029;https://docs.stripe.com/testing.md?testing-method=tokens#visahttps://docs.stripe.com/testing.md?testing-]8;;        
  ]8;id=1684347029;https://docs.stripe.com/testing.md?testing-method=tokens#visamethod=tokens#visa]8;; available if you need them.                                                                                          
                                                                                                                                          
   Description          | Token             | Details                                                                                     
  ----------------------|-------------------|---------------------------------------------------------------------------------------------
   Asynchronous success | tok_pendingRefund | The charge succeeds. If you initiate a refund, its status begins as pending. Some time      
                        |                   | later, its status transitions to succeeded and sends a refund.updated ]8;id=1345380568;https://docs.stripe.com/api/events/types.md#event_types-refund.updatedevent[1]]8;;.             
   Asynchronous failure | tok_refundFail    | The charge succeeds. If you initiate a refund, its status begins as succeeded. Some time    
                        |                   | later, its status transitions to failed and sends a refund.failed ]8;id=2047207500;https://docs.stripe.com/api/events/types.md#event_types-refund.failedevent[2]]8;;.                 
                                                                                                                                          
  [1]: event ]8;id=1345380568;https://docs.stripe.com/api/events/types.md#event_types-refund.updatedhttps://docs.stripe.com/api/events/types.md#event_types-refund.updated]8;;                                                       
  [2]: event ]8;id=2047207500;https://docs.stripe.com/api/events/types.md#event_types-refund.failedhttps://docs.stripe.com/api/events/types.md#event_types-refund.failed]8;;                                                        
                                                                                                                                          
  You can cancel a card refund only by using the Dashboard. In live mode, you can cancel a card refund within a short but nonspecific     
  period of time. Testing environments simulate that period by allowing you to cancel a card refund within 30 minutes.                    
                                                                                                                                          
  ## Send funds to your available balance                                                                                                 
                                                                                                                                          
  To send the funds from a test transaction directly to your available balance, use the test cards in this section. Other test cards send 
  funds from a successful payment to your pending balance.                                                                                
                                                                                                                                          
  #### Card numbers                                                                                                                       
                                                                                                                                          
   Description            | Number           | Details                                                                                    
  ------------------------|------------------|--------------------------------------------------------------------------------------------
   Bypass pending balance | 4000000000000077 | The US charge succeeds. Funds are added directly to your available balance, bypassing your 
                          |                  | pending balance.                                                                           
   Bypass pending balance | 4000003720000278 | The international charge succeeds. Funds are added directly to your available balance,     
                          |                  | bypassing your pending balance.                                                            
                                                                                                                                          
  #### PaymentMethods                                                                                                                     
                                                                                                                                          
   Description            | PaymentMethod                      | Details                                                                  
  ------------------------|------------------------------------|--------------------------------------------------------------------------
   Bypass pending balance | pm_card_bypassPending              | The US charge succeeds. Funds are added directly to your available       
                          |                                    | balance, bypassing your pending balance.                                 
   Bypass pending balance | pm_card_bypassPendingInternational | The international charge succeeds. Funds are added directly to your      
                          |                                    | available balance, bypassing your pending balance.                       
                                                                                                                                          
  #### Tokens                                                                                                                             
                                                                                                                                          
  Most integrations don’t use tokens anymore, but we make test tokens such as ]8;id=1684347029;https://docs.stripe.com/testing.md?testing-method=tokens#visatok_]8;;]8;id=1684347029;https://docs.stripe.com/testing.md?testing-method=tokens#visavisa]8;; ]8;id=1684347029;https://docs.stripe.com/testing.md?testing-method=tokens#visahttps://docs.stripe.com/testing.md?testing-]8;;        
  ]8;id=1684347029;https://docs.stripe.com/testing.md?testing-method=tokens#visamethod=tokens#visa]8;; available if you need them.                                                                                          
                                                                                                                                          
   Description            | Token                          | Details                                                                      
  ------------------------|--------------------------------|------------------------------------------------------------------------------
   Bypass pending balance | tok_bypassPending              | The US charge succeeds. Funds are added directly to your available balance,  
                          |                                | bypassing your pending balance.                                              
   Bypass pending balance | tok_bypassPendingInternational | The international charge succeeds. Funds are added directly to your          
                          |                                | available balance, bypassing your pending balance.                           
                                                                                                                                          
  ## Test 3D Secure authentication                                                                                                        
                                                                                                                                          
  3D Secure requires an additional layer of authentication for credit card transactions. The test cards in this section allow you to      
  simulate triggering authentication in different payment flows.                                                                          
                                                                                                                                          
  Only cards in this section effectively test your 3D Secure integration by simulating defined 3DS behavior, such as a challenge flow or  
  an unsupported card. Other Stripe testing cards might still trigger 3DS, but Stripe returns attempt_acknowledged to bypass the          
  additional steps because 3DS testing isn’t the objective for those cards.                                                               
                                                                                                                                          
  | #### Dashboard not supported                                                                                                          
  |                                                                                                                                       
  | 3D Secure redirects won’t occur for payments created directly in the Stripe Dashboard. Instead, use your integration’s own frontend or
  | an API call.                                                                                                                          
                                                                                                                                          
  ### Authentication and setup                                                                                                            
                                                                                                                                          
  To simulate payment flows that include authentication, use the test cards in this section. Some of these cards can also be ]8;id=1625942095;https://docs.stripe.com/payments/save-and-reuse.mdset up]8;;       
  ]8;id=1625942095;https://docs.stripe.com/payments/save-and-reuse.mdhttps://docs.stripe.com/payments/save-and-reuse.md]8;; for future payments, or have already been.                                           
                                                                                                                                          
  #### Card numbers                                                                                                                       
                                                                                                                                          
   Description                | Number           | Details                                                                                
  ----------------------------|------------------|----------------------------------------------------------------------------------------
   Authenticate unless set up | 4000002500003155 | This card requires authentication for off-session payments unless you ]8;id=1625942095;https://docs.stripe.com/payments/save-and-reuse.mdset it up[1]]8;; for 
                              |                  | future payments. After you set it up, off-session payments no longer require           
                              |                  | authentication. However, on-session payments with this card always require             
                              |                  | authentication.                                                                        
   Always authenticate        | 4000002760003184 | This card requires authentication on all transactions, regardless of how the card is   
                              |                  | set up.                                                                                
   Already set up             | 4000003800000446 | This card is already set up for off-session use. It requires authentication for ]8;id=559780621;https://docs.stripe.com/payments/accept-a-payment.md?platform=webone-]8;;   
                              |                  | ]8;id=559780621;https://docs.stripe.com/payments/accept-a-payment.md?platform=webtime[2]]8;; and other ]8;id=3256061503;https://docs.stripe.com/payments/existing-customers.md?platform=web&ui=elementson-session[3]]8;; payments. However, all *off-session payments* (A       
                              |                  | payment is described as off-session if it occurs without the direct involvement of the 
                              |                  | customer, using previously-collected payment information) succeed as if the card has   
                              |                  | been previously ]8;id=1625942095;https://docs.stripe.com/payments/save-and-reuse.mdset up[4]]8;;.                                                             
   Insufficient funds         | 4000008260003178 | This card requires authentication for ]8;id=559780621;https://docs.stripe.com/payments/accept-a-payment.md?platform=webone-time payments[5]]8;;. All payments are declined  
                              |                  | with an insufficient_funds failure code even after being successfully authenticated or 
                              |                  | previously ]8;id=1625942095;https://docs.stripe.com/payments/save-and-reuse.mdset up[4]]8;;.                                                                  
                                                                                                                                          
  [1]: set it up ]8;id=1625942095;https://docs.stripe.com/payments/save-and-reuse.mdhttps://docs.stripe.com/payments/save-and-reuse.md]8;;                                                                       
  [2]: one-time ]8;id=559780621;https://docs.stripe.com/payments/accept-a-payment.md?platform=webhttps://docs.stripe.com/payments/accept-a-payment.md?platform=web]8;;                                                         
  [3]: on-session ]8;id=3256061503;https://docs.stripe.com/payments/existing-customers.md?platform=web&ui=elementshttps://docs.stripe.com/payments/existing-customers.md?platform=web&ui=elements]8;;                                         
  [4]: set up ]8;id=1625942095;https://docs.stripe.com/payments/save-and-reuse.mdhttps://docs.stripe.com/payments/save-and-reuse.md]8;;                                                                          
  [5]: one-time payments ]8;id=559780621;https://docs.stripe.com/payments/accept-a-payment.md?platform=webhttps://docs.stripe.com/payments/accept-a-payment.md?platform=web]8;;                                                
                                                                                                                                          
  #### PaymentMethods                                                                                                                     
                                                                                                                                          
   Description                | PaymentMethod                                      | Details                                              
  ----------------------------|----------------------------------------------------|------------------------------------------------------
   Authenticate unless set up | pm_card_authenticationRequiredOnSetup              | This card requires authentication for every payment  
                              |                                                    | unless you ]8;id=1625942095;https://docs.stripe.com/payments/save-and-reuse.mdset it up[1]]8;; for future payments. After   
                              |                                                    | you set it up, it no longer requires authentication. 
   Always authenticate        | pm_card_authenticationRequired                     | This card requires authentication on all             
                              |                                                    | transactions, regardless of how the card is set up.  
   Already set up             | pm_card_authenticationRequiredSetupForOffSession   | This card is already set up for off-session use. It  
                              |                                                    | requires authentication for ]8;id=559780621;https://docs.stripe.com/payments/accept-a-payment.md?platform=webone-time[2]]8;; and other    
                              |                                                    | ]8;id=3256061503;https://docs.stripe.com/payments/existing-customers.md?platform=web&ui=elementson-session[3]]8;; payments. However, all off-session     
                              |                                                    | payments succeed as if the card has been previously  
                              |                                                    | ]8;id=1625942095;https://docs.stripe.com/payments/save-and-reuse.mdset up[4]]8;;.                                           
   Insufficient funds         | pm_card_authenticationRequiredChargeDeclinedInsuff | This card requires authentication for ]8;id=559780621;https://docs.stripe.com/payments/accept-a-payment.md?platform=webone-time]8;;       
                              | icientFunds                                        | ]8;id=559780621;https://docs.stripe.com/payments/accept-a-payment.md?platform=webpayments[5]]8;;. All payments are declined with an       
                              |                                                    | insufficient_funds failure code even after being     
                              |                                                    | successfully authenticated or previously ]8;id=1625942095;https://docs.stripe.com/payments/save-and-reuse.mdset up[4]]8;;.  
                                                                                                                                          
  [1]: set it up ]8;id=1625942095;https://docs.stripe.com/payments/save-and-reuse.mdhttps://docs.stripe.com/payments/save-and-reuse.md]8;;                                                                       
  [2]: one-time ]8;id=559780621;https://docs.stripe.com/payments/accept-a-payment.md?platform=webhttps://docs.stripe.com/payments/accept-a-payment.md?platform=web]8;;                                                         
  [3]: on-session ]8;id=3256061503;https://docs.stripe.com/payments/existing-customers.md?platform=web&ui=elementshttps://docs.stripe.com/payments/existing-customers.md?platform=web&ui=elements]8;;                                         
  [4]: set up ]8;id=1625942095;https://docs.stripe.com/payments/save-and-reuse.mdhttps://docs.stripe.com/payments/save-and-reuse.md]8;;                                                                          
  [5]: one-time payments ]8;id=559780621;https://docs.stripe.com/payments/accept-a-payment.md?platform=webhttps://docs.stripe.com/payments/accept-a-payment.md?platform=web]8;;                                                
                                                                                                                                          
  ### Support and availability                                                                                                            
                                                                                                                                          
  Stripe requests authentication when required by regulation or when triggered by your Radar rules or custom code. Even if authentication 
  is requested, it can’t always be performed—for instance, the customer’s card might not be enrolled, or an error might occur. Use the    
  test cards in this section to simulate various combinations of these factors.                                                           
                                                                                                                                          
  All 3DS references indicate ]8;id=1333041623;https://stripe.com/guides/3d-secure-23D Secure 2]8;; ]8;id=1333041623;https://stripe.com/guides/3d-secure-2https://stripe.com/guides/3d-secure-2]8;;.                                                          
                                                                                                                                          
  #### Card numbers                                                                                                                       
                                                                                                                                          
   3D Secure usage       | Outcome        | Number                    | Details                                                           
  -----------------------|----------------|---------------------------|-------------------------------------------------------------------
   3DS Required          | OK             | 4000000000003220          | 3D Secure authentication must be completed for the payment to be  
                         |                |                           | successful. By default, your Radar rules request 3D Secure        
                         |                |                           | authentication for this card. Ireland-issued (IE).                
   3DS Required          | OK             | 4000008400000027          | 3D Secure authentication must be completed for the payment to be  
                         |                |                           | successful. By default, your Radar rules request 3D Secure        
                         |                |                           | authentication for this card. US-issued (US).                     
   3DS Required          | Declined       | 4000008400001629          | 3D Secure authentication is required, but payments are declined   
                         |                |                           | with a card_declined failure code after authentication. By        
                         |                |                           | default, your Radar rules request 3D Secure authentication for    
                         |                |                           | this card.                                                        
   3DS Required          | Error          | 4000008400001280          | 3D Secure authentication is required, but the 3D Secure lookup    
                         |                |                           | request fails with a processing error. Payments are declined with 
                         |                |                           | a card_declined failure code. By default, your Radar rules        
                         |                |                           | request 3D Secure authentication for this card.                   
   3DS Supported         | OK             | 4000000000003055          | 3D Secure authentication might still be performed, but isn’t      
                         |                |                           | required. By default, your Radar rules don’t request 3D Secure    
                         |                |                           | authentication for this card.                                     
   3DS Supported         | Error          | 4000000000003097          | 3D Secure authentication might still be performed, but isn’t      
                         |                |                           | required. However, attempts to perform 3D Secure result in a      
                         |                |                           | processing error. By default, your Radar rules don’t request 3D   
                         |                |                           | Secure authentication for this card.                              
   3DS Supported         | Unenrolled     | 4242424242424242          | 3D Secure is supported for this card, but this card isn’t         
                         |                |                           | enrolled in 3D Secure. Even if your Radar rules request 3D        
                         |                |                           | Secure, the customer won’t be prompted to authenticate. By        
                         |                |                           | default, your Radar rules don’t request 3D Secure authentication  
                         |                |                           | for this card.                                                    
   3DS Not supported     | 37828224631000 | 3D Secure isn’t supported |                                                                   
                         | 5              | on this card and can’t be |                                                                   
                         |                | invoked. The              |                                                                   
                         |                | PaymentIntent or          |                                                                   
                         |                | SetupIntent proceeds      |                                                                   
                         |                | without performing        |                                                                   
                         |                | authentication.           |                                                                   
   3DS Frictionless flow | OK             | 4000000032200000          | 3D Secure authentication is required on all transactions,         
                         |                |                           | regardless of how the card is set up. The authentication proceeds 
                         |                |                           | through a frictionless flow, and succeeds.                        
                                                                                                                                          
  #### PaymentMethods                                                                                                                     
                                                                                                                                          
   3D Secure usage | Outcome    | PaymentMethod                               | Details                                                   
  -----------------|------------|---------------------------------------------|-----------------------------------------------------------
   Required        | OK         | pm_card_threeDSecure2Required               | 3D Secure authentication must be completed for the        
                   |            |                                             | payment to be successful. By default, your Radar rules    
                   |            |                                             | request 3D Secure authentication for this card.           
   Required        | Declined   | pm_card_threeDSecureRequiredChargeDeclined  | 3D Secure authentication is required, but payments are    
                   |            |                                             | declined with a card_declined failure code after          
                   |            |                                             | authentication. By default, your Radar rules request 3D   
                   |            |                                             | Secure authentication for this card.                      
   Required        | Error      | pm_card_threeDSecureRequiredProcessingError | 3D Secure authentication is required, but the 3D Secure   
                   |            |                                             | lookup request fails with a processing error. Payments    
                   |            |                                             | are declined with a card_declined failure code. By        
                   |            |                                             | default, your Radar rules request 3D Secure               
                   |            |                                             | authentication for this card.                             
   Supported       | OK         | pm_card_threeDSecureOptional                | 3D Secure authentication might still be performed, but    
                   |            |                                             | isn’t required. By default, your Radar rules don’t        
                   |            |                                             | request 3D Secure authentication for this card.           
   Supported       | Error      | pm_card_threeDSecureOptionalProcessingError | 3D Secure authentication might still be performed, but    
                   |            |                                             | isn’t required. However, attempts to perform 3D Secure    
                   |            |                                             | result in a processing error. By default, your Radar      
                   |            |                                             | rules don’t request 3D Secure authentication for this     
                   |            |                                             | card.                                                     
   Supported       | Unenrolled | pm_card_visa                                | 3D Secure is supported for this card, but this card isn’t 
                   |            |                                             | enrolled in 3D Secure. Even if your Radar rules request   
                   |            |                                             | 3D Secure, the customer won’t be prompted to              
                   |            |                                             | authenticate. By default, your Radar rules don’t request  
                   |            |                                             | 3D Secure authentication for this card.                   
   Not supported   |            | pm_card_amex_threeDSecureNotSupported       | 3D Secure isn’t supported on this card and can’t be       
                   |            |                                             | invoked. The PaymentIntent or SetupIntent proceeds        
                   |            |                                             | without performing authentication.                        
                                                                                                                                          
  #### Tokens                                                                                                                             
                                                                                                                                          
  Most integrations don’t use tokens anymore, but we make test tokens such as ]8;id=1684347029;https://docs.stripe.com/testing.md?testing-method=tokens#visatok_]8;;]8;id=1684347029;https://docs.stripe.com/testing.md?testing-method=tokens#visavisa]8;; ]8;id=1684347029;https://docs.stripe.com/testing.md?testing-method=tokens#visahttps://docs.stripe.com/testing.md?testing-]8;;        
  ]8;id=1684347029;https://docs.stripe.com/testing.md?testing-method=tokens#visamethod=tokens#visa]8;; available if you need them.                                                                                          
                                                                                                                                          
   3D Secure usage | Outcome    | Token                                   | Details                                                       
  -----------------|------------|-----------------------------------------|---------------------------------------------------------------
   Required        | OK         | tok_threeDSecure2Required               | 3D Secure authentication must be completed for the payment to 
                   |            |                                         | be successful. By default, your Radar rules request 3D Secure 
                   |            |                                         | authentication for this card.                                 
   Required        | Declined   | tok_threeDSecureRequiredChargeDeclined  | 3D Secure authentication is required, but payments are        
                   |            |                                         | declined with a card_declined failure code after              
                   |            |                                         | authentication. By default, your Radar rules request 3D       
                   |            |                                         | Secure authentication for this card.                          
   Required        | Error      | tok_threeDSecureRequiredProcessingError | 3D Secure authentication is required, but the 3D Secure       
                   |            |                                         | lookup request fails with a processing error. Payments are    
                   |            |                                         | declined with a card_declined failure code. By default, your  
                   |            |                                         | Radar rules request 3D Secure authentication for this card.   
   Supported       | OK         | tok_threeDSecureOptional                | 3D Secure authentication might still be performed, but isn’t  
                   |            |                                         | required. By default, your Radar rules don’t request 3D       
                   |            |                                         | Secure authentication for this card.                          
   Supported       | Error      | tok_threeDSecureOptionalProcessingError | 3D Secure authentication might still be performed, but isn’t  
                   |            |                                         | required. However, attempts to perform 3D Secure result in a  
                   |            |                                         | processing error. By default, your Radar rules don’t request  
                   |            |                                         | 3D Secure authentication for this card.                       
   Supported       | Unenrolled | tok_visa                                | 3D Secure is supported for this card, but this card isn’t     
                   |            |                                         | enrolled in 3D Secure. Even if your Radar rules request 3D    
                   |            |                                         | Secure, the customer won’t be prompted to authenticate. By    
                   |            |                                         | default, your Radar rules don’t request 3D Secure             
                   |            |                                         | authentication for this card.                                 
   Not supported   |            | tok_amex_threeDSecureNotSupported       | 3D Secure isn’t supported on this card and can’t be invoked.  
                   |            |                                         | The PaymentIntent proceeds without performing authentication. 
                                                                                                                                          
  ### 3D Secure mobile challenge flows                                                                                                    
                                                                                                                                          
  In a mobile payment, several challenge flows for authentication—where the customer has to interact with prompts in the UI—are available.
  Use the test cards in this section to trigger a specific challenge flow for test purposes. These cards aren’t useful in browser-based   
  payment forms or in API calls. In those environments, they work but don’t trigger any special behavior. Because they’re not useful in   
  API calls, we don’t provide any PaymentMethod or Token values to test with.                                                             
                                                                                                                                          
   Challenge flow    | Number           | Details                                                                                         
  -------------------|------------------|-------------------------------------------------------------------------------------------------
   Out of band       | 4000582600000094 | 3D Secure 2 authentication must be completed on all transactions. Triggers the challenge flow   
                     |                  | with Out of Band UI.                                                                            
   One time passcode | 4000582600000045 | 3D Secure 2 authentication must be completed on all transactions. Triggers the challenge flow   
                     |                  | with One Time Passcode UI.                                                                      
   Single select     | 4000582600000102 | 3D Secure 2 authentication must be completed on all transactions. Triggers the challenge flow   
                     |                  | with single-select UI.                                                                          
   Multi select      | 4000582600000110 | 3D Secure 2 authentication must be completed on all transactions. Triggers the challenge flow   
                     |                  | with multi-select UI.                                                                           
                                                                                                                                          
  ## Simulate a captcha challenge                                                                                                         
                                                                                                                                          
  To prevent fraud, Stripe might display a captcha challenge to the user on the payment page. Use the following test cards to simulate    
  this flow.                                                                                                                              
                                                                                                                                          
   Description                  | Number                       | Details                                                                  
  ------------------------------|------------------------------|--------------------------------------------------------------------------
   Captcha challenge            | 4000000000001208             | The charge succeeds if the user correctly answers the captcha challenge. 
   Captcha challenge            | 4000000000003725             | The charge succeeds if the user correctly answers the captcha challenge. 
                                                                                                                                          
  ## Simulate an in-person payment with a PIN                                                                                             
                                                                                                                                          
  Use the test cards in this section to simulate successful in-person payments where a PIN is involved. For additional testing options,   
  including a simulated reader and physical test cards, see ]8;id=33817659;https://docs.stripe.com/terminal/references/testing.mdTest Stripe Terminal]8;; ]8;id=33817659;https://docs.stripe.com/terminal/references/testing.mdhttps://docs.stripe.com/terminal/references/testing.md]8;;.  
                                                                                                                                          
  #### Card numbers                                                                                                                       
                                                                                                                                          
   Description       | Number           | Details                                                                                         
  -------------------|------------------|-------------------------------------------------------------------------------------------------
   Offline PIN       | 4001007020000002 | This card simulates a payment where the cardholder is prompted for and enters an *offline PIN*  
                     |                  | (Offline PIN is a card verification method for EMV chip cards. These cards store the PIN        
                     |                  | securely on the chip itself, so PIN verification can occur without a network connection). The   
                     |                  | resulting charge has ]8;id=2727056403;https://docs.stripe.com/api/charges/object.md#charge_object-payment_method_details-card_present-receipt-cardholder_verification_methodcardholder_verification_method[1]]8;; set to offline_pin.                      
   Offline PIN retry | 4000008260000075 | Simulates an SCA-triggered retry flow where a cardholder’s initial contactless charge fails and 
                     |                  | the reader then prompts the user to insert their card and enter their *offline PIN* (Offline    
                     |                  | PIN is a card verification method for EMV chip cards. These cards store the PIN securely on the 
                     |                  | chip itself, so PIN verification can occur without a network connection). The resulting charge  
                     |                  | has ]8;id=2727056403;https://docs.stripe.com/api/charges/object.md#charge_object-payment_method_details-card_present-receipt-cardholder_verification_methodcardholder_verification_method[1]]8;; set to offline_pin.                                       
   Online PIN        | 4001000360000005 | This card simulates a payment where the cardholder is prompted for and enters an *online PIN*   
                     |                  | (Online PIN is a card verification method for EMV chip cards. These cards require the terminal  
                     |                  | to contact the issuer over a network connection to verify the PIN). The resulting charge has    
                     |                  | ]8;id=2727056403;https://docs.stripe.com/api/charges/object.md#charge_object-payment_method_details-card_present-receipt-cardholder_verification_methodcardholder_verification_method[1]]8;; set to online_pin.                                            
   Online PIN retry  | 4000002760000008 | Simulates an SCA-triggered retry flow where a cardholder’s initial contactless charge fails and 
                     |                  | the reader then prompts the user to insert their card and enter their *online PIN* (Online PIN  
                     |                  | is a card verification method for EMV chip cards. These cards require the terminal to contact   
                     |                  | the issuer over a network connection to verify the PIN). The resulting charge has               
                     |                  | ]8;id=2727056403;https://docs.stripe.com/api/charges/object.md#charge_object-payment_method_details-card_present-receipt-cardholder_verification_methodcardholder_verification_method[1]]8;; set to online_pin.                                            
                                                                                                                                          
  [1]: cardholder_verification_method ]8;id=2727056403;https://docs.stripe.com/api/charges/object.md#charge_object-payment_method_details-card_present-receipt-cardholder_verification_methodhttps://docs.stripe.com/api/charges/object.md#charge_object-payment_method_details-card_present-rec…]8;;
                                                                                                                                          
  #### PaymentMethods                                                                                                                     
                                                                                                                                          
   Description       | Number                | Details                                                                                    
  -------------------|-----------------------|--------------------------------------------------------------------------------------------
   Offline PIN       | offline_pin_cvm       | This card simulates a payment where the cardholder is prompted for and enters an *offline  
                     |                       | PIN* (Offline PIN is a card verification method for EMV chip cards. These cards store the  
                     |                       | PIN securely on the chip itself, so PIN verification can occur without a network           
                     |                       | connection). The resulting charge has ]8;id=2727056403;https://docs.stripe.com/api/charges/object.md#charge_object-payment_method_details-card_present-receipt-cardholder_verification_methodcardholder_verification_method[1]]8;; set to             
                     |                       | offline_pin.                                                                               
   Offline PIN retry | offline_pin_sca_retry | Simulates an SCA-triggered retry flow where a cardholder’s initial contactless charge      
                     |                       | fails and the reader then prompts the user to insert their card and enter their *offline   
                     |                       | PIN* (Offline PIN is a card verification method for EMV chip cards. These cards store the  
                     |                       | PIN securely on the chip itself, so PIN verification can occur without a network           
                     |                       | connection). The resulting charge has ]8;id=2727056403;https://docs.stripe.com/api/charges/object.md#charge_object-payment_method_details-card_present-receipt-cardholder_verification_methodcardholder_verification_method[1]]8;; set to             
                     |                       | offline_pin.                                                                               
   Online PIN        | online_pin_cvm        | This card simulates a payment where the cardholder is prompted for and enters an *online   
                     |                       | PIN* (Online PIN is a card verification method for EMV chip cards. These cards require the 
                     |                       | terminal to contact the issuer over a network connection to verify the PIN). The resulting 
                     |                       | charge has ]8;id=2727056403;https://docs.stripe.com/api/charges/object.md#charge_object-payment_method_details-card_present-receipt-cardholder_verification_methodcardholder_verification_method[1]]8;; set to online_pin.                            
   Online PIN retry  | online_pin_sca_retry  | Simulates an SCA-triggered retry flow where a cardholder’s initial contactless charge      
                     |                       | fails and the reader then prompts the user to insert their card and enter their *online    
                     |                       | PIN* (Online PIN is a card verification method for EMV chip cards. These cards require the 
                     |                       | terminal to contact the issuer over a network connection to verify the PIN). The resulting 
                     |                       | charge has ]8;id=2727056403;https://docs.stripe.com/api/charges/object.md#charge_object-payment_method_details-card_present-receipt-cardholder_verification_methodcardholder_verification_method[1]]8;; set to online_pin.                            
                                                                                                                                          
  [1]: cardholder_verification_method ]8;id=2727056403;https://docs.stripe.com/api/charges/object.md#charge_object-payment_method_details-card_present-receipt-cardholder_verification_methodhttps://docs.stripe.com/api/charges/object.md#charge_object-payment_method_details-card_present-rec…]8;;
                                                                                                                                          
  ## Test a webhook or event destination                                                                                                  
                                                                                                                                          
  To test your webhook endpoint or ]8;id=71197727;https://docs.stripe.com/events/how-events-work.mdevent destination]8;; ]8;id=71197727;https://docs.stripe.com/events/how-events-work.mdhttps://docs.stripe.com/events/how-events-work.md]8;;, choose one of these two options:  
                                                                                                                                          
  1. Perform actions in a sandbox that trigger real events to your event destination. For example, to trigger the ]8;id=602303266;https://docs.stripe.com/api.md#event_types-charge.succeededcharge.succeeded]8;;        
  ]8;id=602303266;https://docs.stripe.com/api.md#event_types-charge.succeededhttps://docs.stripe.com/api.md#event_types-charge.succeeded]8;; event, you can use a ]8;id=349262491;https://docs.stripe.com/testing.md#cardstest card that produces a successful charge]8;;            
  ]8;id=349262491;https://docs.stripe.com/testing.md#cardshttps://docs.stripe.com/testing.md#cards]8;;.                                                                                               
  2. ]8;id=2222489674;https://docs.stripe.com/webhooks.md#test-webhookTrigger events using the Stripe CLI]8;; ]8;id=2222489674;https://docs.stripe.com/webhooks.md#test-webhookhttps://docs.stripe.com/webhooks.md#test-webhook]8;; or ]8;id=524242252;https://docs.stripe.com/stripe-vscode.md#webhooksusing Stripe for Visual Studio Code]8;;          
  ]8;id=524242252;https://docs.stripe.com/stripe-vscode.md#webhookshttps://docs.stripe.com/stripe-vscode.md#webhooks]8;;.                                                                                      
                                                                                                                                          
  ## Rate limits                                                                                                                          
                                                                                                                                          
  If requests in your test environment return 429 errors, reduce your request frequency. The rate limiter is stricter in test environments
  than in live mode. For an alternative, see ]8;id=1036003116;https://docs.stripe.com/rate-limits.md#load-testingLoad testing]8;; ]8;id=1036003116;https://docs.stripe.com/rate-limits.md#load-testinghttps://docs.stripe.com/rate-limits.md#load-testing]8;;.                            
                                                                                                                                          
  ## Test a non-card payment method                                                                                                       
                                                                                                                                          
  When you use a test non-card payment method, use ]8;id=2475632055;https://docs.stripe.com/keys.md#obtain-api-keystest API keys]8;; ]8;id=2475632055;https://docs.stripe.com/keys.md#obtain-api-keyshttps://docs.stripe.com/keys.md#obtain-api-keys]8;; in all API calls. This is
  true whether you’re serving a payment form you can test interactively or writing test code.                                             
                                                                                                                                          
  Different payment methods have different test procedures:                                                                               
                                                                                                                                          
  #### ACH Direct Debit                                                                                                                   
                                                                                                                                          
  Learn how to test scenarios with instant verifications using ]8;id=2036529781;https://docs.stripe.com/financial-connections/testing.md#web-how-to-use-test-accountsFinancial Connections]8;; ]8;id=2036529781;https://docs.stripe.com/financial-connections/testing.md#web-how-to-use-test-accountshttps://docs.stripe.com/financial-]8;;                   
  ]8;id=2036529781;https://docs.stripe.com/financial-connections/testing.md#web-how-to-use-test-accountsconnections/testing.md#web-how-to-use-test-accounts]8;;.                                                                                    
                                                                                                                                          
  ### Send transaction emails in a sandbox                                                                                                
                                                                                                                                          
  After you collect the bank account details and accept a mandate, send the mandate confirmation and microdeposit verification emails in a
  *sandbox* (A sandbox is an isolated test environment that allows you to test Stripe functionality in your account without affecting your
  live integration. Use sandboxes to safely experiment with new features and changes).                                                    
                                                                                                                                          
  If your domain is **{domain}** and your username is **{username}**, use the following email format to send test transaction emails:     
  **{username}+test_email@{domain}**.                                                                                                     
                                                                                                                                          
  For example, if your domain is **example.com** and your username is **info**, use the format **info+test_email@example.com** for testing
  ACH Direct Debit payments. This format ensures that emails route correctly. If you don’t include the **+test_email** suffix, Stripe     
  won’t send the email.                                                                                                                   
                                                                                                                                          
  | You must ]8;id=3534274046;https://docs.stripe.com/get-started/account/set-up.mdset up your Stripe account]8;; ]8;id=3534274046;https://docs.stripe.com/get-started/account/set-up.mdhttps://docs.stripe.com/get-started/account/set-up.md]8;; before you can trigger these emails while   
  | testing.                                                                                                                              
                                                                                                                                          
  ### Test account numbers                                                                                                                
                                                                                                                                          
  Stripe provides several test account numbers and corresponding tokens you can use to make sure your integration for manually-entered    
  bank accounts is ready for production.                                                                                                  
                                                                                                                                          
   Account number | Token                                | Routing number | Behavior                                                      
  ----------------|--------------------------------------|----------------|---------------------------------------------------------------
   000123456789   | pm_usBankAccount_success             | 110000000      | The payment succeeds.                                         
   000111111113   | pm_usBankAccount_accountClosed       | 110000000      | The payment fails because the account is closed.              
   000000004954   | pm_usBankAccount_riskLevelHighest    | 110000000      | The payment is blocked by Radar due to a ]8;id=4260339296;https://docs.stripe.com/radar/transaction-risk-prevention.md#high-riskhigh risk of]8;;         
                  |                                      |                | ]8;id=4260339296;https://docs.stripe.com/radar/transaction-risk-prevention.md#high-riskfraud[1]]8;;.                                                     
   000111111116   | pm_usBankAccount_noAccount           | 110000000      | The payment fails because no account is found.                
   000222222227   | pm_usBankAccount_insufficientFunds   | 110000000      | The payment fails due to insufficient funds.                  
   000333333335   | pm_usBankAccount_debitNotAuthorized  | 110000000      | The payment fails because debits aren’t authorized.           
   000444444440   | pm_usBankAccount_invalidCurrency     | 110000000      | The payment fails due to invalid currency.                    
   000666666661   | pm_usBankAccount_failMicrodeposits   | 110000000      | The payment fails to send microdeposits.                      
   000555555559   | pm_usBankAccount_dispute             | 110000000      | The payment triggers a dispute.                               
   000000000009   | pm_usBankAccount_processing          | 110000000      | The payment stays in processing indefinitely. Useful for      
                  |                                      |                | testing ]8;id=3073318019;https://docs.stripe.com/api/payment_intents/cancel.mdPaymentIntent cancellation[2]]8;;.                        
   000777777771   | pm_usBankAccount_weeklyLimitExceeded | 110000000      | The payment fails due to payment amount causing the account   
                  |                                      |                | to exceed its weekly payment volume limit.                    
   000888888885   |                                      | 110000000      | The payment fails because of a deactivated ]8;id=1492365453;https://docs.stripe.com/financial-connections/tokenized-account-numbers.mdtokenized account]8;;  
                  |                                      |                | ]8;id=1492365453;https://docs.stripe.com/financial-connections/tokenized-account-numbers.mdnumber[3]]8;;.                                                    
                                                                                                                                          
  [1]: high risk of fraud ]8;id=4260339296;https://docs.stripe.com/radar/transaction-risk-prevention.md#high-riskhttps://docs.stripe.com/radar/transaction-risk-prevention.md#high-risk]8;;                                          
  [2]: PaymentIntent cancellation ]8;id=3073318019;https://docs.stripe.com/api/payment_intents/cancel.mdhttps://docs.stripe.com/api/payment_intents/cancel.md]8;;                                                   
  [3]: tokenized account number ]8;id=1492365453;https://docs.stripe.com/financial-connections/tokenized-account-numbers.mdhttps://docs.stripe.com/financial-connections/tokenized-account-numbers.md]8;;                                
                                                                                                                                          
  Before test transactions can complete, you need to verify all test accounts that automatically succeed or fail the payment. To do so,   
  use the test microdeposit amounts or descriptor codes in the following table.                                                           
                                                                                                                                          
  ### Test microdeposit amounts and descriptor codes                                                                                      
                                                                                                                                          
  To mimic different scenarios, use these microdeposit amounts or 0.01 descriptor code values.                                            
                                                                                                                                          
   Microdeposit values              | 0.01 descriptor code values      | Scenario                                                         
  ----------------------------------|----------------------------------|------------------------------------------------------------------
   32 and 45                        | SM11AA                           | Simulates verifying the account.                                 
   10 and 11                        | SM33CC                           | Simulates exceeding the number of allowed verification attempts. 
   40 and 41                        | SM44DD                           | Simulates a microdeposit timeout.                                
                                                                                                                                          
  ### Test settlement behavior                                                                                                            
                                                                                                                                          
  Test transactions settle instantly and are added to your available test balance. This behavior differs from live mode, where            
  transactions can take ]8;id=335893687;https://docs.stripe.com/payments/ach-direct-debit.md#timingmultiple days]8;; ]8;id=335893687;https://docs.stripe.com/payments/ach-direct-debit.md#timinghttps://docs.stripe.com/payments/ach-direct-debit.md#timing]8;; to settle in your available balance.    
                                                                                                                                          
  #### SEPA Direct Debit                                                                                                                  
                                                                                                                                          
  Create a test PaymentIntent that either succeeds or fails by doing the following:                                                       
                                                                                                                                          
  1. Create a test *PaymentMethod* (PaymentMethods represent your customer's payment instruments, used with the Payment Intents or Setup  
  Intents APIs) with a test account number.                                                                                               
  2. Use the resulting PaymentMethod in a confirmSepaDebitPayment request to create the test charge.                                      
                                                                                                                                          
  ### AT                                                                                                                                  
                                                                                                                                          
   Account Number       | Token                                       | Description                                                       
  ----------------------|---------------------------------------------|-------------------------------------------------------------------
   AT611904300234573201 | pm_sepaDebit_success_at                     | The PaymentIntent status transitions from processing to           
                        |                                             | succeeded.                                                        
   AT321904300235473204 | pm_sepaDebit_successDelayed_at              | The PaymentIntent status transitions from processing to succeeded 
                        |                                             | after at least three minutes.                                     
   AT861904300235473202 | pm_sepaDebit_failed_at                      | The PaymentIntent status transitions from processing to           
                        |                                             | requires_payment_method.                                          
   AT051904300235473205 | pm_sepaDebit_failedDelayed_at               | The PaymentIntent status transitions from processing to           
                        |                                             | requires_payment_method after at least three minutes.             
   AT201904300000454545 | pm_sepaDebit_mandateRevoked_at              | The PaymentIntent status transitions from processing to           
                        |                                             | requires_payment_method with a debit_not_authorized failure code. 
                        |                                             | The mandate becomes inactive. Collect a new mandate before        
                        |                                             | retrying the payment.                                             
   AT591904300235473203 | pm_sepaDebit_disputed_at                    | The PaymentIntent status transitions from processing to           
                        |                                             | succeeded, but a dispute is immediately created.                  
   AT981904300000343434 | pm_sepaDebit_exceedsWeeklyVolumeLimit_at    | The payment fails with a charge_exceeds_source_limit failure code 
                        |                                             | due to payment amount causing account to exceed its weekly        
                        |                                             | payment volume limit.                                             
   AT601904300000121212 | pm_sepaDebit_exceedsWeeklyTransactionLimit_ | The payment fails with a charge_exceeds_weekly_limit failure code 
                        | at                                          | due to payment amount exceeding account's transaction volume      
                        |                                             | limit.                                                            
   AT981904300002222227 | pm_sepaDebit_insufficientFunds_at           | The payment fails with an insufficient_funds failure code.        
   AT511904300000066666 |                                             | Payment method creation fails with a bank_account_unusable error. 
                        |                                             | Use a different bank account or payment method. Applies to        
                        |                                             | SetupIntents and PaymentIntents that include inline IBAN data.    
                                                                                                                                          
  ### BE                                                                                                                                  
                                                                                                                                          
   Account Number   | Token                                         | Description                                                         
  ------------------|-----------------------------------------------|---------------------------------------------------------------------
   BE62510007547061 | pm_sepaDebit_success_be                       | The PaymentIntent status transitions from processing to succeeded.  
   BE78510007547064 | pm_sepaDebit_successDelayed_be                | The PaymentIntent status transitions from processing to succeeded   
                    |                                               | after at least three minutes.                                       
   BE68539007547034 | pm_sepaDebit_failed_be                        | The PaymentIntent status transitions from processing to             
                    |                                               | requires_payment_method.                                            
   BE51510007547065 | pm_sepaDebit_failedDelayed_be                 | The PaymentIntent status transitions from processing to             
                    |                                               | requires_payment_method after at least three minutes.               
   BE12510000454545 | pm_sepaDebit_mandateRevoked_be                | The PaymentIntent status transitions from processing to             
                    |                                               | requires_payment_method with a debit_not_authorized failure code.   
                    |                                               | The mandate becomes inactive. Collect a new mandate before retrying 
                    |                                               | the payment.                                                        
   BE08510007547063 | pm_sepaDebit_disputed_be                      | The PaymentIntent status transitions from processing to succeeded,  
                    |                                               | but a dispute is immediately created.                               
   BE90510000343434 | pm_sepaDebit_exceedsWeeklyVolumeLimit_be      | The payment fails with a charge_exceeds_source_limit failure code   
                    |                                               | due to payment amount causing account to exceed its weekly payment  
                    |                                               | volume limit.                                                       
   BE52510000121212 | pm_sepaDebit_exceedsWeeklyTransactionLimit_be | The payment fails with a charge_exceeds_weekly_limit failure code   
                    |                                               | due to payment amount exceeding account's transaction volume limit. 
   BE90510002222227 | pm_sepaDebit_insufficientFunds_be             | The payment fails with an insufficient_funds failure code.          
   BE43510000066666 |                                               | Payment method creation fails with a bank_account_unusable error.   
                    |                                               | Use a different bank account or payment method. Applies to          
                    |                                               | SetupIntents and PaymentIntents that include inline IBAN data.      
                                                                                                                                          
  ### HR                                                                                                                                  
                                                                                                                                          
   Account Number        | Token                                      | Description                                                       
  -----------------------|--------------------------------------------|-------------------------------------------------------------------
   HR7624020064583467589 | pm_sepaDebit_success_hr                    | The PaymentIntent status transitions from processing to           
                         |                                            | succeeded.                                                        
   HR6323600002337876649 | pm_sepaDebit_successDelayed_hr             | The PaymentIntent status transitions from processing to succeeded 
                         |                                            | after at least three minutes.                                     
   HR2725000096983499248 | pm_sepaDebit_failed_hr                     | The PaymentIntent status transitions from processing to           
                         |                                            | requires_payment_method.                                          
   HR6723600004878117427 | pm_sepaDebit_failedDelayed_hr              | The PaymentIntent status transitions from processing to           
                         |                                            | requires_payment_method after at least three minutes.             
   HR9324020060000454545 | pm_sepaDebit_mandateRevoked_hr             | The PaymentIntent status transitions from processing to           
                         |                                            | requires_payment_method with a debit_not_authorized failure code. 
                         |                                            | The mandate becomes inactive. Collect a new mandate before        
                         |                                            | retrying the payment.                                             
   HR8724840081455523553 | pm_sepaDebit_disputed_hr                   | The PaymentIntent status transitions from processing to           
                         |                                            | succeeded, but a dispute is immediately created.                  
   HR7424020060000343434 | pm_sepaDebit_exceedsWeeklyVolumeLimit_hr   | The payment fails with a charge_exceeds_source_limit failure code 
                         |                                            | due to payment amount causing account to exceed its weekly        
                         |                                            | payment volume limit.                                             
   HR3624020060000121212 | pm_sepaDebit_exceedsWeeklyTransactionLimit | The payment fails with a charge_exceeds_weekly_limit failure code 
                         | _hr                                        | due to payment amount exceeding account's transaction volume      
                         |                                            | limit.                                                            
   HR7424020060002222227 | pm_sepaDebit_insufficientFunds_hr          | The payment fails with an insufficient_funds failure code.        
   HR2724020060000066666 |                                            | Payment method creation fails with a bank_account_unusable error. 
                         |                                            | Use a different bank account or payment method. Applies to        
                         |                                            | SetupIntents and PaymentIntents that include inline IBAN data.    
                                                                                                                                          
  ### EE                                                                                                                                  
                                                                                                                                          
   Account Number       | Token                                       | Description                                                       
  ----------------------|---------------------------------------------|-------------------------------------------------------------------
   EE382200221020145685 | pm_sepaDebit_success_ee                     | The PaymentIntent status transitions from processing to           
                        |                                             | succeeded.                                                        
   EE222200221020145682 | pm_sepaDebit_successDelayed_ee              | The PaymentIntent status transitions from processing to succeeded 
                        |                                             | after at least three minutes.                                     
   EE762200221020145680 | pm_sepaDebit_failed_ee                      | The PaymentIntent status transitions from processing to           
                        |                                             | requires_payment_method.                                          
   EE922200221020145683 | pm_sepaDebit_failedDelayed_ee               | The PaymentIntent status transitions from processing to           
                        |                                             | requires_payment_method after at least three minutes.             
   EE862200000000454545 | pm_sepaDebit_mandateRevoked_ee              | The PaymentIntent status transitions from processing to           
                        |                                             | requires_payment_method with a debit_not_authorized failure code. 
                        |                                             | The mandate becomes inactive. Collect a new mandate before        
                        |                                             | retrying the payment.                                             
   EE492200221020145681 | pm_sepaDebit_disputed_ee                    | The PaymentIntent status transitions from processing to           
                        |                                             | succeeded, but a dispute is immediately created.                  
   EE672200000000343434 | pm_sepaDebit_exceedsWeeklyVolumeLimit_ee    | The payment fails with a charge_exceeds_source_limit failure code 
                        |                                             | due to payment amount causing account to exceed its weekly        
                        |                                             | payment volume limit.                                             
   EE292200000000121212 | pm_sepaDebit_exceedsWeeklyTransactionLimit_ | The payment fails with a charge_exceeds_weekly_limit failure code 
                        | ee                                          | due to payment amount exceeding account's transaction volume      
                        |                                             | limit.                                                            
   EE672200000002222227 | pm_sepaDebit_insufficientFunds_ee           | The payment fails with an insufficient_funds failure code.        
   EE202200000000066666 |                                             | Payment method creation fails with a bank_account_unusable error. 
                        |                                             | Use a different bank account or payment method. Applies to        
                        |                                             | SetupIntents and PaymentIntents that include inline IBAN data.    
                                                                                                                                          
  ### FI                                                                                                                                  
                                                                                                                                          
   Account Number     | Token                                         | Description                                                       
  --------------------|-----------------------------------------------|-------------------------------------------------------------------
   FI2112345600000785 | pm_sepaDebit_success_fi                       | The PaymentIntent status transitions from processing to           
                      |                                               | succeeded.                                                        
   FI3712345600000788 | pm_sepaDebit_successDelayed_fi                | The PaymentIntent status transitions from processing to succeeded 
                      |                                               | after at least three minutes.                                     
   FI9112345600000786 | pm_sepaDebit_failed_fi                        | The PaymentIntent status transitions from processing to           
                      |                                               | requires_payment_method.                                          
   FI1012345600000789 | pm_sepaDebit_failedDelayed_fi                 | The PaymentIntent status transitions from processing to           
                      |                                               | requires_payment_method after at least three minutes.             
   FI8612345600454545 | pm_sepaDebit_mandateRevoked_fi                | The PaymentIntent status transitions from processing to           
                      |                                               | requires_payment_method with a debit_not_authorized failure code. 
                      |                                               | The mandate becomes inactive. Collect a new mandate before        
                      |                                               | retrying the payment.                                             
   FI6412345600000787 | pm_sepaDebit_disputed_fi                      | The PaymentIntent status transitions from processing to           
                      |                                               | succeeded, but a dispute is immediately created.                  
   FI6712345600343434 | pm_sepaDebit_exceedsWeeklyVolumeLimit_fi      | The payment fails with a charge_exceeds_source_limit failure code 
                      |                                               | due to payment amount causing account to exceed its weekly        
                      |                                               | payment volume limit.                                             
   FI2912345600121212 | pm_sepaDebit_exceedsWeeklyTransactionLimit_fi | The payment fails with a charge_exceeds_weekly_limit failure code 
                      |                                               | due to payment amount exceeding account's transaction volume      
                      |                                               | limit.                                                            
   FI6712345602222227 | pm_sepaDebit_insufficientFunds_fi             | The payment fails with an insufficient_funds failure code.        
   FI2012345600066666 |                                               | Payment method creation fails with a bank_account_unusable error. 
                      |                                               | Use a different bank account or payment method. Applies to        
                      |                                               | SetupIntents and PaymentIntents that include inline IBAN data.    
                                                                                                                                          
  ### FR                                                                                                                                  
                                                                                                                                          
   Account Number              | Token                                | Description                                                       
  -----------------------------|--------------------------------------|-------------------------------------------------------------------
   FR1420041010050500013M02606 | pm_sepaDebit_success_fr              | The PaymentIntent status transitions from processing to           
                               |                                      | succeeded.                                                        
   FR3020041010050500013M02609 | pm_sepaDebit_successDelayed_fr       | The PaymentIntent status transitions from processing to succeeded 
                               |                                      | after at least three minutes.                                     
   FR8420041010050500013M02607 | pm_sepaDebit_failed_fr               | The PaymentIntent status transitions from processing to           
                               |                                      | requires_payment_method.                                          
   FR7920041010050500013M02600 | pm_sepaDebit_failedDelayed_fr        | The PaymentIntent status transitions from processing to           
                               |                                      | requires_payment_method after at least three minutes.             
   FR1920041010050000000454545 | pm_sepaDebit_mandateRevoked_fr       | The PaymentIntent status transitions from processing to           
                               |                                      | requires_payment_method with a debit_not_authorized failure code. 
                               |                                      | The mandate becomes inactive. Collect a new mandate before        
                               |                                      | retrying the payment.                                             
   FR5720041010050500013M02608 | pm_sepaDebit_disputed_fr             | The PaymentIntent status transitions from processing to           
                               |                                      | succeeded, but a dispute is immediately created.                  
   FR9720041010050000000343434 | pm_sepaDebit_exceedsWeeklyVolumeLimi | The payment fails with a charge_exceeds_source_limit failure code 
                               | t_fr                                 | due to payment amount causing account to exceed its weekly        
                               |                                      | payment volume limit.                                             
   FR5920041010050000000121212 | pm_sepaDebit_exceedsWeeklyTransactio | The payment fails with a charge_exceeds_weekly_limit failure code 
                               | nLimit_fr                            | due to payment amount exceeding account's transaction volume      
                               |                                      | limit.                                                            
   FR9720041010050000002222227 | pm_sepaDebit_insufficientFunds_fr    | The payment fails with an insufficient_funds failure code.        
   FR5020041010050000000066666 |                                      | Payment method creation fails with a bank_account_unusable error. 
                               |                                      | Use a different bank account or payment method. Applies to        
                               |                                      | SetupIntents and PaymentIntents that include inline IBAN data.    
                                                                                                                                          
  ### DE                                                                                                                                  
                                                                                                                                          
   Account Number         | Token                                     | Description                                                       
  ------------------------|-------------------------------------------|-------------------------------------------------------------------
   DE89370400440532013000 | pm_sepaDebit_success_de                   | The PaymentIntent status transitions from processing to           
                          |                                           | succeeded.                                                        
   DE08370400440532013003 | pm_sepaDebit_successDelayed_de            | The PaymentIntent status transitions from processing to succeeded 
                          |                                           | after at least three minutes.                                     
   DE62370400440532013001 | pm_sepaDebit_failed_de                    | The PaymentIntent status transitions from processing to           
                          |                                           | requires_payment_method.                                          
   DE78370400440532013004 | pm_sepaDebit_failedDelayed_de             | The PaymentIntent status transitions from processing to           
                          |                                           | requires_payment_method after at least three minutes.             
   DE84370400440000454545 | pm_sepaDebit_mandateRevoked_de            | The PaymentIntent status transitions from processing to           
                          |                                           | requires_payment_method with a debit_not_authorized failure code. 
                          |                                           | The mandate becomes inactive. Collect a new mandate before        
                          |                                           | retrying the payment.                                             
   DE35370400440532013002 | pm_sepaDebit_disputed_de                  | The PaymentIntent status transitions from processing to           
                          |                                           | succeeded, but a dispute is immediately created.                  
   DE65370400440000343434 | pm_sepaDebit_exceedsWeeklyVolumeLimit_de  | The payment fails with a charge_exceeds_source_limit failure code 
                          |                                           | due to payment amount causing account to exceed its weekly        
                          |                                           | payment volume limit.                                             
   DE27370400440000121212 | pm_sepaDebit_exceedsWeeklyTransactionLimi | The payment fails with a charge_exceeds_weekly_limit failure code 
                          | t_de                                      | due to payment amount exceeding account's transaction volume      
                          |                                           | limit.                                                            
   DE65370400440002222227 | pm_sepaDebit_insufficientFunds_de         | The payment fails with an insufficient_funds failure code.        
   DE18370400440000066666 |                                           | Payment method creation fails with a bank_account_unusable error. 
                          |                                           | Use a different bank account or payment method. Applies to        
                          |                                           | SetupIntents and PaymentIntents that include inline IBAN data.    
                                                                                                                                          
  ### GI                                                                                                                                  
                                                                                                                                          
   Account Number          | Token                                    | Description                                                       
  -------------------------|------------------------------------------|-------------------------------------------------------------------
   GI60MPFS599327643783385 | pm_sepaDebit_success_gi                  | The PaymentIntent status transitions from processing to           
                           |                                          | succeeded.                                                        
   GI08RRNW626436291644533 | pm_sepaDebit_successDelayed_gi           | The PaymentIntent status transitions from processing to succeeded 
                           |                                          | after at least three minutes.                                     
   GI41SAFA461293238477751 | pm_sepaDebit_failed_gi                   | The PaymentIntent status transitions from processing to           
                           |                                          | requires_payment_method.                                          
   GI50LROG772261344693297 | pm_sepaDebit_failedDelayed_gi            | The PaymentIntent status transitions from processing to           
                           |                                          | requires_payment_method after at least three minutes.             
   GI33NWBK000000000454545 | pm_sepaDebit_mandateRevoked_gi           | The PaymentIntent status transitions from processing to           
                           |                                          | requires_payment_method with a debit_not_authorized failure code. 
                           |                                          | The mandate becomes inactive. Collect a new mandate before        
                           |                                          | retrying the payment.                                             
   GI26KJBC361883934534696 | pm_sepaDebit_disputed_gi                 | The PaymentIntent status transitions from processing to           
                           |                                          | succeeded, but a dispute is immediately created.                  
   GI14NWBK000000000343434 | pm_sepaDebit_exceedsWeeklyVolumeLimit_gi | The payment fails with a charge_exceeds_source_limit failure code 
                           |                                          | due to payment amount causing account to exceed its weekly        
                           |                                          | payment volume limit.                                             
   GI73NWBK000000000121212 | pm_sepaDebit_exceedsWeeklyTransactionLim | The payment fails with a charge_exceeds_weekly_limit failure code 
                           | it_gi                                    | due to payment amount exceeding account's transaction volume      
                           |                                          | limit.                                                            
   GI14NWBK000000002222227 | pm_sepaDebit_insufficientFunds_gi        | The payment fails with an insufficient_funds failure code.        
   GI64NWBK000000000066666 |                                          | Payment method creation fails with a bank_account_unusable error. 
                           |                                          | Use a different bank account or payment method. Applies to        
                           |                                          | SetupIntents and PaymentIntents that include inline IBAN data.    
                                                                                                                                          
  ### IE                                                                                                                                  
                                                                                                                                          
   Account Number         | Token                                     | Description                                                       
  ------------------------|-------------------------------------------|-------------------------------------------------------------------
   IE29AIBK93115212345678 | pm_sepaDebit_success_ie                   | The PaymentIntent status transitions from processing to           
                          |                                           | succeeded.                                                        
   IE24AIBK93115212345671 | pm_sepaDebit_successDelayed_ie            | The PaymentIntent status transitions from processing to succeeded 
                          |                                           | after at least three minutes.                                     
   IE02AIBK93115212345679 | pm_sepaDebit_failed_ie                    | The PaymentIntent status transitions from processing to           
                          |                                           | requires_payment_method.                                          
   IE94AIBK93115212345672 | pm_sepaDebit_failedDelayed_ie             | The PaymentIntent status transitions from processing to           
                          |                                           | requires_payment_method after at least three minutes.             
   IE29AIBK93115200454545 | pm_sepaDebit_mandateRevoked_ie            | The PaymentIntent status transitions from processing to           
                          |                                           | requires_payment_method with a debit_not_authorized failure code. 
                          |                                           | The mandate becomes inactive. Collect a new mandate before        
                          |                                           | retrying the payment.                                             
   IE51AIBK93115212345670 | pm_sepaDebit_disputed_ie                  | The PaymentIntent status transitions from processing to           
                          |                                           | succeeded, but a dispute is immediately created.                  
   IE10AIBK93115200343434 | pm_sepaDebit_exceedsWeeklyVolumeLimit_ie  | The payment fails with a charge_exceeds_source_limit failure code 
                          |                                           | due to payment amount causing account to exceed its weekly        
                          |                                           | payment volume limit.                                             
   IE69AIBK93115200121212 | pm_sepaDebit_exceedsWeeklyTransactionLimi | The payment fails with a charge_exceeds_weekly_limit failure code 
                          | t_ie                                      | due to payment amount exceeding account's transaction volume      
                          |                                           | limit.                                                            
   IE10AIBK93115202222227 | pm_sepaDebit_insufficientFunds_ie         | The payment fails with an insufficient_funds failure code.        
   IE60AIBK93115200066666 |                                           | Payment method creation fails with a bank_account_unusable error. 
                          |                                           | Use a different bank account or payment method. Applies to        
                          |                                           | SetupIntents and PaymentIntents that include inline IBAN data.    
                                                                                                                                          
  ### LI                                                                                                                                  
                                                                                                                                          
   Account Number        | Token                                      | Description                                                       
  -----------------------|--------------------------------------------|-------------------------------------------------------------------
   LI0508800636123378777 | pm_sepaDebit_success_li                    | The PaymentIntent status transitions from processing to           
                         |                                            | succeeded.                                                        
   LI4408800387787111369 | pm_sepaDebit_successDelayed_li             | The PaymentIntent status transitions from processing to succeeded 
                         |                                            | after at least three minutes.                                     
   LI1208800143823175626 | pm_sepaDebit_failed_li                     | The PaymentIntent status transitions from processing to           
                         |                                            | requires_payment_method.                                          
   LI4908800356441975566 | pm_sepaDebit_failedDelayed_li              | The PaymentIntent status transitions from processing to           
                         |                                            | requires_payment_method after at least three minutes.             
   LI4308800000000454545 | pm_sepaDebit_mandateRevoked_li             | The PaymentIntent status transitions from processing to           
                         |                                            | requires_payment_method with a debit_not_authorized failure code. 
                         |                                            | The mandate becomes inactive. Collect a new mandate before        
                         |                                            | retrying the payment.                                             
   LI7708800125525347723 | pm_sepaDebit_disputed_li                   | The PaymentIntent status transitions from processing to           
                         |                                            | succeeded, but a dispute is immediately created.                  
   LI2408800000000343434 | pm_sepaDebit_exceedsWeeklyVolumeLimit_li   | The payment fails with a charge_exceeds_source_limit failure code 
                         |                                            | due to payment amount causing account to exceed its weekly        
                         |                                            | payment volume limit.                                             
   LI8308800000000121212 | pm_sepaDebit_exceedsWeeklyTransactionLimit | The payment fails with a charge_exceeds_weekly_limit failure code 
                         | _li                                        | due to payment amount exceeding account's transaction volume      
                         |                                            | limit.                                                            
   LI2408800000002222227 | pm_sepaDebit_insufficientFunds_li          | The payment fails with an insufficient_funds failure code.        
   LI7408800000000066666 |                                            | Payment method creation fails with a bank_account_unusable error. 
                         |                                            | Use a different bank account or payment method. Applies to        
                         |                                            | SetupIntents and PaymentIntents that include inline IBAN data.    
                                                                                                                                          
  ### LT                                                                                                                                  
                                                                                                                                          
   Account Number       | Token                                       | Description                                                       
  ----------------------|---------------------------------------------|-------------------------------------------------------------------
   LT121000011101001000 | pm_sepaDebit_success_lt                     | The PaymentIntent status transitions from processing to           
                        |                                             | succeeded.                                                        
   LT281000011101001003 | pm_sepaDebit_successDelayed_lt              | The PaymentIntent status transitions from processing to succeeded 
                        |                                             | after at least three minutes.                                     
   LT821000011101001001 | pm_sepaDebit_failed_lt                      | The PaymentIntent status transitions from processing to           
                        |                                             | requires_payment_method.                                          
   LT981000011101001004 | pm_sepaDebit_failedDelayed_lt               | The PaymentIntent status transitions from processing to           
                        |                                             | requires_payment_method after at least three minutes.             
   LT781000000000454545 | pm_sepaDebit_mandateRevoked_lt              | The PaymentIntent status transitions from processing to           
                        |                                             | requires_payment_method with a debit_not_authorized failure code. 
                        |                                             | The mandate becomes inactive. Collect a new mandate before        
                        |                                             | retrying the payment.                                             
   LT551000011101001002 | pm_sepaDebit_disputed_lt                    | The PaymentIntent status transitions from processing to           
                        |                                             | succeeded, but a dispute is immediately created.                  
   LT591000000000343434 | pm_sepaDebit_exceedsWeeklyVolumeLimit_lt    | The payment fails with a charge_exceeds_source_limit failure code 
                        |                                             | due to payment amount causing account to exceed its weekly        
                        |                                             | payment volume limit.                                             
   LT211000000000121212 | pm_sepaDebit_exceedsWeeklyTransactionLimit_ | The payment fails with a charge_exceeds_weekly_limit failure code 
                        | lt                                          | due to payment amount exceeding account's transaction volume      
                        |                                             | limit.                                                            
   LT591000000002222227 | pm_sepaDebit_insufficientFunds_lt           | The payment fails with an insufficient_funds failure code.        
   LT121000000000066666 |                                             | Payment method creation fails with a bank_account_unusable error. 
                        |                                             | Use a different bank account or payment method. Applies to        
                        |                                             | SetupIntents and PaymentIntents that include inline IBAN data.    
                                                                                                                                          
  ### LU                                                                                                                                  
                                                                                                                                          
   Account Number       | Token                                       | Description                                                       
  ----------------------|---------------------------------------------|-------------------------------------------------------------------
   LU280019400644750000 | pm_sepaDebit_success_lu                     | The PaymentIntent status transitions from processing to           
                        |                                             | succeeded.                                                        
   LU440019400644750003 | pm_sepaDebit_successDelayed_lu              | The PaymentIntent status transitions from processing to succeeded 
                        |                                             | after at least three minutes.                                     
   LU980019400644750001 | pm_sepaDebit_failed_lu                      | The PaymentIntent status transitions from processing to           
                        |                                             | requires_payment_method.                                          
   LU170019400644750004 | pm_sepaDebit_failedDelayed_lu               | The PaymentIntent status transitions from processing to           
                        |                                             | requires_payment_method after at least three minutes.             
   LU120010000000454545 | pm_sepaDebit_mandateRevoked_lu              | The PaymentIntent status transitions from processing to           
                        |                                             | requires_payment_method with a debit_not_authorized failure code. 
                        |                                             | The mandate becomes inactive. Collect a new mandate before        
                        |                                             | retrying the payment.                                             
   LU710019400644750002 | pm_sepaDebit_disputed_lu                    | The PaymentIntent status transitions from processing to           
                        |                                             | succeeded, but a dispute is immediately created.                  
   LU900010000000343434 | pm_sepaDebit_exceedsWeeklyVolumeLimit_lu    | The payment fails with a charge_exceeds_source_limit failure code 
                        |                                             | due to payment amount causing account to exceed its weekly        
                        |                                             | payment volume limit.                                             
   LU520010000000121212 | pm_sepaDebit_exceedsWeeklyTransactionLimit_ | The payment fails with a charge_exceeds_weekly_limit failure code 
                        | lu                                          | due to payment amount exceeding account's transaction volume      
                        |                                             | limit.                                                            
   LU900010000002222227 | pm_sepaDebit_insufficientFunds_lu           | The payment fails with an insufficient_funds failure code.        
   LU430010000000066666 |                                             | Payment method creation fails with a bank_account_unusable error. 
                        |                                             | Use a different bank account or payment method. Applies to        
                        |                                             | SetupIntents and PaymentIntents that include inline IBAN data.    
                                                                                                                                          
  ### NL                                                                                                                                  
                                                                                                                                          
   Account Number     | Token                                         | Description                                                       
  --------------------|-----------------------------------------------|-------------------------------------------------------------------
   NL39RABO0300065264 | pm_sepaDebit_success_nl                       | The PaymentIntent status transitions from processing to           
                      |                                               | succeeded.                                                        
   NL55RABO0300065267 | pm_sepaDebit_successDelayed_nl                | The PaymentIntent status transitions from processing to succeeded 
                      |                                               | after at least three minutes.                                     
   NL91ABNA0417164300 | pm_sepaDebit_failed_nl                        | The PaymentIntent status transitions from processing to           
                      |                                               | requires_payment_method.                                          
   NL28RABO0300065268 | pm_sepaDebit_failedDelayed_nl                 | The PaymentIntent status transitions from processing to           
                      |                                               | requires_payment_method after at least three minutes.             
   NL46RABO0000454545 | pm_sepaDebit_mandateRevoked_nl                | The PaymentIntent status transitions from processing to           
                      |                                               | requires_payment_method with a debit_not_authorized failure code. 
                      |                                               | The mandate becomes inactive. Collect a new mandate before        
                      |                                               | retrying the payment.                                             
   NL82RABO0300065266 | pm_sepaDebit_disputed_nl                      | The PaymentIntent status transitions from processing to           
                      |                                               | succeeded, but a dispute is immediately created.                  
   NL27RABO0000343434 | pm_sepaDebit_exceedsWeeklyVolumeLimit_nl      | The payment fails with a charge_exceeds_source_limit failure code 
                      |                                               | due to payment amount causing account to exceed its weekly        
                      |                                               | payment volume limit.                                             
   NL86RABO0000121212 | pm_sepaDebit_exceedsWeeklyTransactionLimit_nl | The payment fails with a charge_exceeds_weekly_limit failure code 
                      |                                               | due to payment amount exceeding account's transaction volume      
                      |                                               | limit.                                                            
   NL27RABO0002222227 | pm_sepaDebit_insufficientFunds_nl             | The payment fails with an insufficient_funds failure code.        
   NL77RABO0000066666 |                                               | Payment method creation fails with a bank_account_unusable error. 
                      |                                               | Use a different bank account or payment method. Applies to        
                      |                                               | SetupIntents and PaymentIntents that include inline IBAN data.    
                                                                                                                                          
  ### NO                                                                                                                                  
                                                                                                                                          
   Account Number  | Token                                         | Description                                                          
  -----------------|-----------------------------------------------|----------------------------------------------------------------------
   NO9386011117947 | pm_sepaDebit_success_no                       | The PaymentIntent status transitions from processing to succeeded.   
   NO8886011117940 | pm_sepaDebit_successDelayed_no                | The PaymentIntent status transitions from processing to succeeded    
                   |                                               | after at least three minutes.                                        
   NO6686011117948 | pm_sepaDebit_failed_no                        | The PaymentIntent status transitions from processing to              
                   |                                               | requires_payment_method.                                             
   NO6186011117941 | pm_sepaDebit_failedDelayed_no                 | The PaymentIntent status transitions from processing to              
                   |                                               | requires_payment_method after at least three minutes.                
   NO2486010454545 | pm_sepaDebit_mandateRevoked_no                | The PaymentIntent status transitions from processing to              
                   |                                               | requires_payment_method with a debit_not_authorized failure code.    
                   |                                               | The mandate becomes inactive. Collect a new mandate before retrying  
                   |                                               | the payment.                                                         
   NO3986011117949 | pm_sepaDebit_disputed_no                      | The PaymentIntent status transitions from processing to succeeded,   
                   |                                               | but a dispute is immediately created.                                
   NO0586010343434 | pm_sepaDebit_exceedsWeeklyVolumeLimit_no      | The payment fails with a charge_exceeds_source_limit failure code    
                   |                                               | due to payment amount causing account to exceed its weekly payment   
                   |                                               | volume limit.                                                        
   NO6486010121212 | pm_sepaDebit_exceedsWeeklyTransactionLimit_no | The payment fails with a charge_exceeds_weekly_limit failure code    
                   |                                               | due to payment amount exceeding account's transaction volume limit.  
   NO0586012222227 | pm_sepaDebit_insufficientFunds_no             | The payment fails with an insufficient_funds failure code.           
   NO5586010066666 |                                               | Payment method creation fails with a bank_account_unusable error.    
                   |                                               | Use a different bank account or payment method. Applies to           
                   |                                               | SetupIntents and PaymentIntents that include inline IBAN data.       
                                                                                                                                          
  ### PT                                                                                                                                  
                                                                                                                                          
   Account Number            | Token                                  | Description                                                       
  ---------------------------|----------------------------------------|-------------------------------------------------------------------
   PT50000201231234567890154 | pm_sepaDebit_success_pt                | The PaymentIntent status transitions from processing to           
                             |                                        | succeeded.                                                        
   PT66000201231234567890157 | pm_sepaDebit_successDelayed_pt         | The PaymentIntent status transitions from processing to succeeded 
                             |                                        | after at least three minutes.                                     
   PT23000201231234567890155 | pm_sepaDebit_failed_pt                 | The PaymentIntent status transitions from processing to           
                             |                                        | requires_payment_method.                                          
   PT39000201231234567890158 | pm_sepaDebit_failedDelayed_pt          | The PaymentIntent status transitions from processing to           
                             |                                        | requires_payment_method after at least three minutes.             
   PT24000201230000000454545 | pm_sepaDebit_mandateRevoked_pt         | The PaymentIntent status transitions from processing to           
                             |                                        | requires_payment_method with a debit_not_authorized failure code. 
                             |                                        | The mandate becomes inactive. Collect a new mandate before        
                             |                                        | retrying the payment.                                             
   PT93000201231234567890156 | pm_sepaDebit_disputed_pt               | The PaymentIntent status transitions from processing to           
                             |                                        | succeeded, but a dispute is immediately created.                  
   PT05000201230000000343434 | pm_sepaDebit_exceedsWeeklyVolumeLimit_ | The payment fails with a charge_exceeds_source_limit failure code 
                             | pt                                     | due to payment amount causing account to exceed its weekly        
                             |                                        | payment volume limit.                                             
   PT64000201230000000121212 | pm_sepaDebit_exceedsWeeklyTransactionL | The payment fails with a charge_exceeds_weekly_limit failure code 
                             | imit_pt                                | due to payment amount exceeding account's transaction volume      
                             |                                        | limit.                                                            
   PT05000201230000002222227 | pm_sepaDebit_insufficientFunds_pt      | The payment fails with an insufficient_funds failure code.        
   PT55000201230000000066666 |                                        | Payment method creation fails with a bank_account_unusable error. 
                             |                                        | Use a different bank account or payment method. Applies to        
                             |                                        | SetupIntents and PaymentIntents that include inline IBAN data.    
                                                                                                                                          
  ### ES                                                                                                                                  
                                                                                                                                          
   Account Number           | Token                                   | Description                                                       
  --------------------------|-----------------------------------------|-------------------------------------------------------------------
   ES0700120345030000067890 | pm_sepaDebit_success_es                 | The PaymentIntent status transitions from processing to           
                            |                                         | succeeded.                                                        
   ES2300120345030000067893 | pm_sepaDebit_successDelayed_es          | The PaymentIntent status transitions from processing to succeeded 
                            |                                         | after at least three minutes.                                     
   ES9121000418450200051332 | pm_sepaDebit_failed_es                  | The PaymentIntent status transitions from processing to           
                            |                                         | requires_payment_method.                                          
   ES9300120345030000067894 | pm_sepaDebit_failedDelayed_es           | The PaymentIntent status transitions from processing to           
                            |                                         | requires_payment_method after at least three minutes.             
   ES3600120345000000454545 | pm_sepaDebit_mandateRevoked_es          | The PaymentIntent status transitions from processing to           
                            |                                         | requires_payment_method with a debit_not_authorized failure code. 
                            |                                         | The mandate becomes inactive. Collect a new mandate before        
                            |                                         | retrying the payment.                                             
   ES5000120345030000067892 | pm_sepaDebit_disputed_es                | The PaymentIntent status transitions from processing to           
                            |                                         | succeeded, but a dispute is immediately created.                  
   ES1700120345000000343434 | pm_sepaDebit_exceedsWeeklyVolumeLimit_e | The payment fails with a charge_exceeds_source_limit failure code 
                            | s                                       | due to payment amount causing account to exceed its weekly        
                            |                                         | payment volume limit.                                             
   ES7600120345000000121212 | pm_sepaDebit_exceedsWeeklyTransactionLi | The payment fails with a charge_exceeds_weekly_limit failure code 
                            | mit_es                                  | due to payment amount exceeding account's transaction volume      
                            |                                         | limit.                                                            
   ES1700120345000002222227 | pm_sepaDebit_insufficientFunds_es       | The payment fails with an insufficient_funds failure code.        
   ES6700120345000000066666 |                                         | Payment method creation fails with a bank_account_unusable error. 
                            |                                         | Use a different bank account or payment method. Applies to        
                            |                                         | SetupIntents and PaymentIntents that include inline IBAN data.    
                                                                                                                                          
  ### SE                                                                                                                                  
                                                                                                                                          
   Account Number           | Token                                   | Description                                                       
  --------------------------|-----------------------------------------|-------------------------------------------------------------------
   SE3550000000054910000003 | pm_sepaDebit_success_se                 | The PaymentIntent status transitions from processing to           
                            |                                         | succeeded.                                                        
   SE5150000000054910000006 | pm_sepaDebit_successDelayed_se          | The PaymentIntent status transitions from processing to succeeded 
                            |                                         | after at least three minutes.                                     
   SE0850000000054910000004 | pm_sepaDebit_failed_se                  | The PaymentIntent status transitions from processing to           
                            |                                         | requires_payment_method.                                          
   SE2450000000054910000007 | pm_sepaDebit_failedDelayed_se           | The PaymentIntent status transitions from processing to           
                            |                                         | requires_payment_method after at least three minutes.             
   SE4750000000000000454545 | pm_sepaDebit_mandateRevoked_se          | The PaymentIntent status transitions from processing to           
                            |                                         | requires_payment_method with a debit_not_authorized failure code. 
                            |                                         | The mandate becomes inactive. Collect a new mandate before        
                            |                                         | retrying the payment.                                             
   SE7850000000054910000005 | pm_sepaDebit_disputed_se                | The PaymentIntent status transitions from processing to           
                            |                                         | succeeded, but a dispute is immediately created.                  
   SE2850000000000000343434 | pm_sepaDebit_exceedsWeeklyVolumeLimit_s | The payment fails with a charge_exceeds_source_limit failure code 
                            | e                                       | due to payment amount causing account to exceed its weekly        
                            |                                         | payment volume limit.                                             
   SE8750000000000000121212 | pm_sepaDebit_exceedsWeeklyTransactionLi | The payment fails with a charge_exceeds_weekly_limit failure code 
                            | mit_se                                  | due to payment amount exceeding account's transaction volume      
                            |                                         | limit.                                                            
   SE2850000000000002222227 | pm_sepaDebit_insufficientFunds_se       | The payment fails with an insufficient_funds failure code.        
   SE7850000000000000066666 |                                         | Payment method creation fails with a bank_account_unusable error. 
                            |                                         | Use a different bank account or payment method. Applies to        
                            |                                         | SetupIntents and PaymentIntents that include inline IBAN data.    
                                                                                                                                          
  ### CH                                                                                                                                  
                                                                                                                                          
   Account Number        | Token                                      | Description                                                       
  -----------------------|--------------------------------------------|-------------------------------------------------------------------
   CH9300762011623852957 | pm_sepaDebit_success_ch                    | The PaymentIntent status transitions from processing to           
                         |                                            | succeeded.                                                        
   CH8656663438253651553 | pm_sepaDebit_successDelayed_ch             | The PaymentIntent status transitions from processing to succeeded 
                         |                                            | after at least three minutes.                                     
   CH5362200119938136497 | pm_sepaDebit_failed_ch                     | The PaymentIntent status transitions from processing to           
                         |                                            | requires_payment_method.                                          
   CH1843597160341964438 | pm_sepaDebit_failedDelayed_ch              | The PaymentIntent status transitions from processing to           
                         |                                            | requires_payment_method after at least three minutes.             
   CH3700762000000454545 | pm_sepaDebit_mandateRevoked_ch             | The PaymentIntent status transitions from processing to           
                         |                                            | requires_payment_method with a debit_not_authorized failure code. 
                         |                                            | The mandate becomes inactive. Collect a new mandate before        
                         |                                            | retrying the payment.                                             
   CH1260378413965193069 | pm_sepaDebit_disputed_ch                   | The PaymentIntent status transitions from processing to           
                         |                                            | succeeded, but a dispute is immediately created.                  
   CH1800762000000343434 | pm_sepaDebit_exceedsWeeklyVolumeLimit_ch   | The payment fails with a charge_exceeds_source_limit failure code 
                         |                                            | due to payment amount causing account to exceed its weekly        
                         |                                            | payment volume limit.                                             
   CH7700762000000121212 | pm_sepaDebit_exceedsWeeklyTransactionLimit | The payment fails with a charge_exceeds_weekly_limit failure code 
                         | _ch                                        | due to payment amount exceeding account's transaction volume      
                         |                                            | limit.                                                            
   CH1800762000002222227 | pm_sepaDebit_insufficientFunds_ch          | The payment fails with an insufficient_funds failure code.        
   CH6800762000000066666 |                                            | Payment method creation fails with a bank_account_unusable error. 
                         |                                            | Use a different bank account or payment method. Applies to        
                         |                                            | SetupIntents and PaymentIntents that include inline IBAN data.    
                                                                                                                                          
  ### GB                                                                                                                                  
                                                                                                                                          
   Account Number         | Token                                     | Description                                                       
  ------------------------|-------------------------------------------|-------------------------------------------------------------------
   GB82WEST12345698765432 | pm_sepaDebit_success_gb                   | The PaymentIntent status transitions from processing to           
                          |                                           | succeeded.                                                        
   GB98WEST12345698765435 | pm_sepaDebit_successDelayed_gb            | The PaymentIntent status transitions from processing to succeeded 
                          |                                           | after at least three minutes.                                     
   GB55WEST12345698765433 | pm_sepaDebit_failed_gb                    | The PaymentIntent status transitions from processing to           
                          |                                           | requires_payment_method.                                          
   GB71WEST12345698765436 | pm_sepaDebit_failedDelayed_gb             | The PaymentIntent status transitions from processing to           
                          |                                           | requires_payment_method after at least three minutes.             
   GB89WEST12345600454545 | pm_sepaDebit_mandateRevoked_gb            | The PaymentIntent status transitions from processing to           
                          |                                           | requires_payment_method with a debit_not_authorized failure code. 
                          |                                           | The mandate becomes inactive. Collect a new mandate before        
                          |                                           | retrying the payment.                                             
   GB28WEST12345698765434 | pm_sepaDebit_disputed_gb                  | The PaymentIntent status transitions from processing to           
                          |                                           | succeeded, but a dispute is immediately created.                  
   GB70WEST12345600343434 | pm_sepaDebit_exceedsWeeklyVolumeLimit_gb  | The payment fails with a charge_exceeds_source_limit failure code 
                          |                                           | due to payment amount causing account to exceed its weekly        
                          |                                           | payment volume limit.                                             
   GB32WEST12345600121212 | pm_sepaDebit_exceedsWeeklyTransactionLimi | The payment fails with a charge_exceeds_weekly_limit failure code 
                          | t_gb                                      | due to payment amount exceeding account's transaction volume      
                          |                                           | limit.                                                            
   GB70WEST12345602222227 | pm_sepaDebit_insufficientFunds_gb         | The payment fails with an insufficient_funds failure code.        
   GB23WEST12345600066666 |                                           | Payment method creation fails with a bank_account_unusable error. 
                          |                                           | Use a different bank account or payment method. Applies to        
                          |                                           | SetupIntents and PaymentIntents that include inline IBAN data.    
                                                                                                                                          
  #### BACS Direct Debit                                                                                                                  
                                                                                                                                          
  There are several ]8;id=1489440896;https://docs.stripe.com/keys.md#test-live-modestest bank account numbers]8;; ]8;id=1489440896;https://docs.stripe.com/keys.md#test-live-modeshttps://docs.stripe.com/keys.md#test-live-modes]8;; you can use in a *sandbox* (A sandbox is an 
  isolated test environment that allows you to test Stripe functionality in your account without affecting your live integration. Use     
  sandboxes to safely experiment with new features and changes) to make sure this integration is ready. You can also use the corresponding
  token to skip manually entering bank account details.                                                                                   
                                                                                                                                          
   Sort code | Account number | Token                                 | Description                                                       
  -----------|----------------|---------------------------------------|-------------------------------------------------------------------
   108800    | 00012345       | pm_bacsDebit_success                  | The payment succeeds and the PaymentIntent transitions from       
             |                |                                       | processing to succeeded.                                          
   108800    | 90012345       | pm_bacsDebit_successDelayed           | The payment succeeds after three minutes and the PaymentIntent    
             |                |                                       | transitions from processing to succeeded.                         
   108800    | 33333335       | pm_bacsDebit_debitNotAuthorized       | The payment is accepted but then immediately fails with a         
             |                |                                       | debit_not_authorized failure code and the PaymentIntent           
             |                |                                       | transitions from processing to requires_payment_method. The       
             |                |                                       | mandate becomes inactive and the PaymentMethod can’t be used      
             |                |                                       | again.                                                            
   108800    | 93333335       | pm_bacsDebit_debitNotAuthorizedDelaye | The payment fails after three minutes with a debit_not_authorized 
             |                | d                                     | failure code and the PaymentIntent transitions from processing to 
             |                |                                       | requires_payment_method. The mandate becomes inactive and the     
             |                |                                       | PaymentMethod can’t be used again.                                
   108800    | 22222227       | pm_bacsDebit_insufficientFunds        | The payment fails with an insufficient_funds failure code and the 
             |                |                                       | PaymentIntent transitions from processing to                      
             |                |                                       | requires_payment_method. The mandate remains active and the       
             |                |                                       | PaymentMethod can be used again.                                  
   108800    | 92222227       | pm_bacsDebit_insufficientFundsDelayed | The payment fails after three minutes with an insufficient_funds  
             |                |                                       | failure code and the PaymentIntent transitions from processing to 
             |                |                                       | requires_payment_method. The mandate remains active and the       
             |                |                                       | PaymentMethod can be used again.                                  
   108800    | 55555559       | pm_bacsDebit_dispute                  | The payment succeeds after three minutes and the PaymentIntent    
             |                |                                       | transitions from processing to succeeded, but a dispute is        
             |                |                                       | immediately created.                                              
   108800    | 00033333       | pm_bacsDebit_mandateRefused           | PaymentMethod creation succeeds, but the mandate is refused by    
             |                |                                       | the customer’s bank and immediately transitions to inactive.      
   108800    | 00044444       | —                                     | The request to set up Bacs Direct Debit fails immediately due to  
             |                |                                       | an invalid account number and the customer is prompted to update  
             |                |                                       | their information before submitting. Payment details aren’t       
             |                |                                       | collected, so no synthetic token corresponds to this scenario.    
   108800    | 34343434       | pm_bacsDebit_exceedsWeeklyLimit       | The payment fails with a charge_exceeds_source_limit failure code 
             |                |                                       | due to the payment amount causing the account to exceed its       
             |                |                                       | weekly payment volume limit.                                      
   108800    | 12121212       | pm_bacsDebit_exceedsTransactionLimit  | The payment fails with a charge_exceeds_transaction_limit failure 
             |                |                                       | code due to the payment amount exceeding the account’s            
             |                |                                       | transaction volume limit.                                         
                                                                                                                                          
  You can test using any of the account numbers provided above. However, because Bacs Direct Debit payments take several days to process, 
  use the test account numbers that operate on a three-minute delay to better simulate the behavior of live payments.                     
                                                                                                                                          
  | By default, Stripe automatically sends ]8;id=3235721699;https://docs.stripe.com/payments/bacs-debit.md#debit-notificationsemails]8;; ]8;id=3235721699;https://docs.stripe.com/payments/bacs-debit.md#debit-notificationshttps://docs.stripe.com/payments/bacs-debit.md#debit-notifications]8;; to the customer when 
  | payment details are initially collected and each time a debit will be made on their account. These notifications aren’t sent in       
  | sandboxes.                                                                                                                            
                                                                                                                                          
  #### AU BECS Direct Debit                                                                                                               
                                                                                                                                          
  You can create a test PaymentIntent that either succeeds or fails by doing the following:                                               
                                                                                                                                          
  1. Create a test *PaymentMethod* (PaymentMethods represent your customer's payment instruments, used with the Payment Intents or Setup  
  Intents APIs) with the test BSB 000000 and a test account number from the list below.                                                   
  2. Use the resulting PaymentMethod in a confirmAuBecsDebitPayment request to create the test charge.                                    
                                                                                                                                          
  ### Test account numbers                                                                                                                
                                                                                                                                          
   BSB Number | Account number | Token                                | Description                                                       
  ------------|----------------|--------------------------------------|-------------------------------------------------------------------
   000000     | 000123456      | pm_auBecsDebit_success               | The PaymentIntent status transitions from processing to           
              |                |                                      | succeeded. The mandate status remains active.                     
   000000     | 900123456      | pm_auBecsDebit_successDelayed        | The PaymentIntent status transitions from processing to succeeded 
              |                |                                      | (with a three-minute delay). The mandate status remains active.   
   000000     | 111111113      | pm_auBecsDebit_accountClosed         | The PaymentIntent status transitions from processing to           
              |                |                                      | requires_payment_method with an account_closed failure code. The  
              |                |                                      | mandate status becomes inactive.                                  
   000000     | 111111116      | pm_auBecsDebit_noAccount             | The PaymentIntent status transitions from processing to           
              |                |                                      | requires_payment_method with a no_account failure code. The       
              |                |                                      | mandate status becomes inactive.                                  
   000000     | 222222227      | pm_auBecsDebit_referToCustomer       | The PaymentIntent status transitions from processing to           
              |                |                                      | requires_payment_method with a refer_to_customer failure code.    
              |                |                                      | The mandate status remains active.                                
   000000     | 922222227      | pm_auBecsDebit_referToCustomerDelaye | The PaymentIntent status transitions from processing to           
              |                | d                                    | requires_payment_method with a refer_to_customer failure code     
              |                |                                      | (with a three-minute delay). The mandate status remains active.   
   000000     | 333333335      | pm_auBecsDebit_debitNotAuthorized    | The PaymentIntent status transitions from processing to           
              |                |                                      | requires_payment_method with a debit_not_authorized failure code. 
              |                |                                      | The mandate status becomes inactive.                              
   000000     | 666666660      | pm_auBecsDebit_dispute               | The PaymentIntent status transitions from processing to           
              |                |                                      | succeeded, but a dispute is immediately created.                  
   000000     | 343434343      | pm_auBecsDebit_exceedsWeeklyLimit    | The PaymentIntent fails with a charge_exceeds_source_limit error  
              |                |                                      | due to the payment amount causing the account to exceed its       
              |                |                                      | weekly payment volume limit.                                      
   000000     | 121212121      | pm_auBecsDebit_exceedsTransactionLim | The PaymentIntent fails with a charge_exceeds_transaction_limit   
              |                | it                                   | error due to the payment amount exceeding the account’s           
              |                |                                      | transaction volume limit.                                         
                                                                                                                                          
  #### Others                                                                                                                             
                                                                                                                                          
  With other payment methods, testing information is included with the documentation. ]8;id=4167412496;https://docs.stripe.com/payments/payment-methods/overview.mdFind your payment method]8;;                            
  ]8;id=4167412496;https://docs.stripe.com/payments/payment-methods/overview.mdhttps://docs.stripe.com/payments/payment-methods/overview.md]8;; and read the associated guide to accept and test payments.                 
                                                                                                                                          
  ## Test asynchronous payment methods                                                                                                    
                                                                                                                                          
  Asynchronous, or “delayed notification,” payment methods don’t immediately confirm whether a payment succeeds or fails. After your      
  customer submits payment details, the PaymentIntent can enter a processing state. The final outcome, such as succeeded or               
  requires_payment_method, arrives later, from a few minutes in a sandbox to several business days in live mode.                          
                                                                                                                                          
  This behavior differs from most card payments, which usually receive an immediate authorization response from the issuer.               
                                                                                                                                          
  Don’t rely on a client-side callback or redirect to determine the final status for these payment methods. Always use webhooks to drive  
  fulfillment.                                                                                                                            
                                                                                                                                          
  ### Understand the PaymentIntent lifecycle                                                                                              
                                                                                                                                          
  Payment methods that don’t require further action from your customer to authorize the payment, such as bank debits, move through these  
  states after your customer submits payment:                                                                                             
                                                                                                                                          
   Step                    | State                   | Description                                                                        
  -------------------------|-------------------------|------------------------------------------------------------------------------------
   1                       | processing              | Your customer submitted the payment, and the outcome isn’t yet known.              
   2a                      | succeeded               | The payment is confirmed.                                                          
   2b                      | requires_payment_method | The payment failed, for example because of insufficient funds or a closed account. 
                                                                                                                                          
  Payment methods that require further action from your customer to authorize the payment, such as voucher-based methods including        
  Multibanco, Boleto, OXXO, and Konbini, add an earlier state before processing:                                                          
                                                                                                                                          
   Step | State                   | Description                                                                                           
  ------|-------------------------|-------------------------------------------------------------------------------------------------------
   1    | requires_action         | Stripe issued a voucher or payment code and is waiting for your customer to pay out of band.          
   2    | processing              | Stripe is waiting for the final outcome, and your customer can no longer complete the voucher payment 
        |                         | through the original flow.                                                                            
   3a   | succeeded               | Your customer paid the voucher.                                                                       
   3b   | requires_payment_method | The voucher expired or the payment failed.                                                            
                                                                                                                                          
  ### Handle webhook events                                                                                                               
                                                                                                                                          
  Register a webhook handler, or use the ]8;id=558412101;https://docs.stripe.com/cli.mdStripe CLI]8;; ]8;id=558412101;https://docs.stripe.com/cli.mdhttps://docs.stripe.com/cli.md]8;; to listen locally with stripe listen --forward-to      
  localhost:4242/webhook, and handle these events:                                                                                        
                                                                                                                                          
   Event                          | Description                                       | Recommended action                                
  --------------------------------|---------------------------------------------------|---------------------------------------------------
   payment_intent.processing      | Your customer successfully submitted payment and  | Send a “payment pending” confirmation email and   
                                  | the result is pending. This is most common for    | hold order fulfillment.                           
                                  | bank debits.                                      |                                                   
   payment_intent.succeeded       | The payment is confirmed.                         | Fulfill the order.                                
   payment_intent.payment_failed  | The payment failed, such as for insufficient      | Notify your customer and request a new payment    
                                  | funds, an expired voucher, or a closed account.   | method.                                           
   payment_intent.requires_action | Stripe issued a voucher or out-of-band action and | Send your customer the voucher or payment         
                                  | is waiting for your customer. This applies to     | instructions.                                     
                                  | Multibanco, Boleto, OXXO, and Konbini.            |                                                   
   payment_intent.canceled        | The PaymentIntent was canceled before your        | Notify your customer. Don’t fulfill the order.    
                                  | customer completed payment.                       |                                                   
                                                                                                                                          
  For Checkout-based integrations, these corresponding session-level events also trigger:                                                 
                                                                                                                                          
  • checkout.session.async_payment_succeeded                                                                                              
  • checkout.session.async_payment_failed                                                                                                 
                                                                                                                                          
  ### Review expected webhook sequence by payment method                                                                                  
                                                                                                                                          
  The test values for each method are in the ]8;id=2447773116;https://docs.stripe.com/testing.md#non-card-paymentsTest a non-card payment method]8;; ]8;id=2447773116;https://docs.stripe.com/testing.md#non-card-paymentshttps://docs.stripe.com/testing.md#non-card-payments]8;; section. 
  Use the following tables to understand which webhook sequence to expect when you use those test values.                                 
                                                                                                                                          
  ### Review bank debit webhook sequence                                                                                                  
                                                                                                                                          
  All bank debit methods follow the processing to succeeded or payment_failed pattern. In test mode, transitions happen after about 3     
  minutes for account numbers that simulate a delay. These use a 9 prefix or suffix. See the test values for each method in the referenced
  section.                                                                                                                                
                                                                                                                                          
   Method               | Test values                 | Expected webhooks for success           | Expected webhooks for failure           
  ----------------------|-----------------------------|-----------------------------------------|-----------------------------------------
   SEPA Direct Debit    | ]8;id=2830208130;https://docs.stripe.com/testing.md?payment-method=sepa-direct-debit#non-card-paymentsSee SEPA Direct Debit[1]]8;;    | payment_intent.processing, then         | payment_intent.processing, then         
                        |                             | payment_intent.succeeded                | payment_intent.payment_failed           
   ACH Direct Debit     | ]8;id=2530127469;https://docs.stripe.com/testing.md?payment-method=ach-direct-debit#non-card-paymentsSee ACH Direct Debit[2]]8;;     | payment_intent.processing, then         | payment_intent.processing, then         
                        |                             | payment_intent.succeeded                | payment_intent.payment_failed           
   BACS Direct Debit    | ]8;id=2526507698;https://docs.stripe.com/testing.md?payment-method=bacs-direct-debit#non-card-paymentsSee BACS Direct Debit[3]]8;;    | payment_intent.processing, then         | payment_intent.processing, then         
                        |                             | payment_intent.succeeded                | payment_intent.payment_failed           
   AU BECS Direct Debit | ]8;id=2820560035;https://docs.stripe.com/testing.md?payment-method=au-becs-direct-debit#non-card-paymentsSee AU BECS Direct Debit[4]]8;; | payment_intent.processing, then         | payment_intent.processing, then         
                        |                             | payment_intent.succeeded                | payment_intent.payment_failed           
                                                                                                                                          
  [1]: See SEPA Direct Debit ]8;id=2830208130;https://docs.stripe.com/testing.md?payment-method=sepa-direct-debit#non-card-paymentshttps://docs.stripe.com/testing.md?payment-method=sepa-direct-debit#non-card-payments]8;;                        
  [2]: See ACH Direct Debit ]8;id=2530127469;https://docs.stripe.com/testing.md?payment-method=ach-direct-debit#non-card-paymentshttps://docs.stripe.com/testing.md?payment-method=ach-direct-debit#non-card-payments]8;;                          
  [3]: See BACS Direct Debit ]8;id=2526507698;https://docs.stripe.com/testing.md?payment-method=bacs-direct-debit#non-card-paymentshttps://docs.stripe.com/testing.md?payment-method=bacs-direct-debit#non-card-payments]8;;                        
  [4]: See AU BECS Direct Debit ]8;id=2820560035;https://docs.stripe.com/testing.md?payment-method=au-becs-direct-debit#non-card-paymentshttps://docs.stripe.com/testing.md?payment-method=au-becs-direct-debit#non-card-payments]8;;                  
                                                                                                                                          
  ### Review voucher-based webhook sequence                                                                                               
                                                                                                                                          
  Voucher methods issue a payment code that your customer pays out of band. The PaymentIntent enters requires_action immediately after    
  confirmation. The delayed outcome arrives when your customer pays or when the voucher expires.                                          
                                                                                                                                          
  For Multibanco, Boleto, OXXO, and Konbini, use the email address patterns in ]8;id=2447773116;https://docs.stripe.com/testing.md#non-card-paymentstheir respective test sections]8;;                             
  ]8;id=2447773116;https://docs.stripe.com/testing.md#non-card-paymentshttps://docs.stripe.com/testing.md#non-card-payments]8;; to control whether the simulated voucher is paid, expires, or never resolves.      
                                                                                                                                          
   Method                    | Expected webhooks for success                       | Expected webhooks for failure or expiry              
  ---------------------------|-----------------------------------------------------|------------------------------------------------------
   Multibanco                | payment_intent.requires_action, then                | payment_intent.requires_action, then                 
                             | payment_intent.processing, then                     | payment_intent.processing, then                      
                             | payment_intent.succeeded                            | payment_intent.payment_failed                        
   Boleto, OXXO, and Konbini | payment_intent.requires_action, then                | payment_intent.requires_action, then                 
                             | payment_intent.succeeded                            | payment_intent.payment_failed                        
                                                                                                                                          
  ### Review redirect and delayed notification method                                                                                     
                                                                                                                                          
  Some payment methods redirect your customer for authentication. Depending on the payment method and configuration, Stripe might confirm 
  the final outcome immediately after the redirect or deliver it asynchronously.                                                          
                                                                                                                                          
  Expected webhook events for a successful payment:                                                                                       
                                                                                                                                          
  • payment_intent.processing                                                                                                             
  • payment_intent.succeeded                                                                                                              
                                                                                                                                          
  BLIK can also fail asynchronously in two ways. Use the email patterns in the BLIK test section to simulate them:                        
                                                                                                                                          
  • **Delayed bank decline**: The bank declines the payment after your customer approves it, and payment_intent.payment_failed triggers   
  after a delay.                                                                                                                          
  • **Timeout**: Your customer doesn’t respond in time, and payment_intent.payment_failed triggers after the timeout window.              
                                                                                                                                          
  BLIK can also fail immediately, such as when a code is expired or invalid. These synchronous failures don’t involve a delayed webhook.  
                                                                                                                                          
  ### Test asynchronous flow end to end                                                                                                   
                                                                                                                                          
  Use these tips to test your integration.                                                                                                
                                                                                                                                          
  Use the Stripe CLI to receive webhooks locally:                                                                                         
                                                                                                                                          
    stripe listen --forward-to localhost:4242/webhook                                                                                     
                                                                                                                                          
  Trigger specific events manually to test your handler in isolation without running a full payment flow:                                 
                                                                                                                                          
    stripe trigger payment_intent.processing                                                                                              
    stripe trigger payment_intent.succeeded                                                                                               
    stripe trigger payment_intent.payment_failed                                                                                          
                                                                                                                                          
  Handle processing in your return URL UI. When Stripe redirects your customer back to your site, paymentIntent.status might be           
  processing, not succeeded. Show a payment pending state instead of an error.                                                            
                                                                                                                                          
  Don’t fulfill physical goods on processing. Wait for payment_intent.succeeded. For digital goods, you might choose to grant access      
  speculatively on processing, but your webhook handler must revoke access if payment_intent.payment_failed arrives later.                
                                                                                                                                          
  Test expiration and timeout paths. Use the expire_immediately or fill_never email patterns, where available, to verify that your        
  integration handles unpaid vouchers correctly.                                                                                          
                                                                                                                                          
  If you use the mobile PaymentSheet, enable allowsDelayedPaymentMethods to show delayed notification methods. The final payment status   
  isn’t known when the sheet completes. Tell your customers their order is confirmed, and fulfill only after payment_intent.succeeded     
  arrives.                                                                                                                                
                                                                                                                                          
  ### Review asynchronous payment methods                                                                                                 
                                                                                                                                          
  The following table summarizes the PaymentIntent state each method enters immediately after confirmation, and the webhook events your   
  server should expect once the delayed outcome arrives.                                                                                  
                                                                                                                                          
   Method               | Category                | State after confirm        | Delayed success event    | Delayed failure event         
  ----------------------|-------------------------|----------------------------|--------------------------|-------------------------------
   SEPA Direct Debit    | Bank debit              | processing                 | payment_intent.succeeded | payment_intent.payment_failed 
   ACH Direct Debit     | Bank debit              | processing                 | payment_intent.succeeded | payment_intent.payment_failed 
   BACS Direct Debit    | Bank debit              | processing                 | payment_intent.succeeded | payment_intent.payment_failed 
   AU BECS Direct Debit | Bank debit              | processing                 | payment_intent.succeeded | payment_intent.payment_failed 
   Multibanco           | Voucher                 | requires_action            | payment_intent.succeeded | payment_intent.payment_failed 
   Boleto               | Voucher                 | requires_action            | payment_intent.succeeded | payment_intent.payment_failed 
   OXXO                 | Voucher                 | requires_action            | payment_intent.succeeded | payment_intent.payment_failed 
   Konbini              | Voucher                 | requires_action            | payment_intent.succeeded | payment_intent.payment_failed 
   Pay by Bank          | Redirect and delayed    | requires_action, then      | payment_intent.succeeded | payment_intent.payment_failed 
                        | notification            | usually succeeded or       |                          |                               
                        |                         | requires_payment_method    |                          |                               
                        |                         | after the redirect         |                          |                               
   BLIK                 | Redirect and delayed    | varies                     | payment_intent.succeeded | payment_intent.payment_failed 
                        | notification or timeout |                            |                          |                               
                                                                                                                                          
  ## Test Link                                                                                                                            
                                                                                                                                          
  | Don’t store real user data in *sandbox* (A sandbox is an isolated test environment that allows you to test Stripe functionality in    
  your                                                                                                                                    
  | account without affecting your live integration. Use sandboxes to safely experiment with new features and changes) Link accounts.     
  Treat                                                                                                                                   
  | them as if they’re publicly available, because these test accounts are associated with your publishable key.                          
                                                                                                                                          
  Link supports credit cards, debit cards, and qualified US bank account purchases.                                                       
                                                                                                                                          
  You can create sandbox accounts for Link using any valid email address. The following table shows the fixed one-time passcode values    
  that Stripe accepts for authenticating sandbox accounts:                                                                                
                                                                                                                                          
   Value                                                              | Outcome                                                           
  --------------------------------------------------------------------|-------------------------------------------------------------------
   Any other 6 digits not listed below                                | Success                                                           
   000001                                                             | Error, code invalid                                               
   000002                                                             | Error, code expired                                               
   000003                                                             | Error, max attempts exceeded                                      
                                                                                                                                          
  ### Multiple funding sources                                                                                                            
                                                                                                                                          
  Stripe automatically supports additional funding sources without changes to your integration. They use the same transaction settlement  
  time and processing behavior as card and bank account payments.                                                                         
                                                                                                                                          
  ## Test a redirect-based flow                                                                                                           
                                                                                                                                          
  To test your integration’s redirect-handling logic by simulating a payment that uses a redirect flow (for example, iDEAL), use a        
  supported payment method that ]8;id=1533140592;https://docs.stripe.com/payments/payment-methods/payment-method-support.md#additional-api-supportabilityrequires redirects]8;; ]8;id=1533140592;https://docs.stripe.com/payments/payment-methods/payment-method-support.md#additional-api-supportabilityhttps://docs.stripe.com/payments/payment-methods/payment-method-support.md#additional-]8;; 
  ]8;id=1533140592;https://docs.stripe.com/payments/payment-methods/payment-method-support.md#additional-api-supportabilityapi-supportability]8;;.                                                                                                                     
                                                                                                                                          
  To create a test PaymentIntent that either succeeds or fails:                                                                           
                                                                                                                                          
  1. Go to the ]8;id=1727747902;https://dashboard.stripe.com/settings/payment_methodspayment methods settings in the Dashboard]8;; ]8;id=1727747902;https://dashboard.stripe.com/settings/payment_methodshttps://dashboard.stripe.com/settings/payment_methods]8;; and enable a supported     
  payment method by clicking **Turn on** in your testing environment.                                                                     
  2. Collect payment details.                                                                                                             
  3. Submit the payment to Stripe.                                                                                                        
  4. Authorize or fail the test payment.                                                                                                  
                                                                                                                                          
  Make sure that the page (corresponding to return_url) on your website provides the status of the payment.                               
                                                                                                                                          
  ## See also                                                                                                                             
                                                                                                                                          
  • ]8;id=1019598380;https://docs.stripe.com/connect/testing.mdTesting your Connect integration]8;; ]8;id=1019598380;https://docs.stripe.com/connect/testing.mdhttps://docs.stripe.com/connect/testing.md]8;;                                                           
  • ]8;id=2289992515;https://docs.stripe.com/billing/testing.mdTesting your Billing integration]8;; ]8;id=2289992515;https://docs.stripe.com/billing/testing.mdhttps://docs.stripe.com/billing/testing.md]8;;                                                           
  • ]8;id=33817659;https://docs.stripe.com/terminal/references/testing.mdTesting your Terminal integration]8;; ]8;id=33817659;https://docs.stripe.com/terminal/references/testing.mdhttps://docs.stripe.com/terminal/references/testing.md]8;;                                              
  • ]8;id=1036003116;https://docs.stripe.com/rate-limits.md#load-testingLoad testing]8;; ]8;id=1036003116;https://docs.stripe.com/rate-limits.md#load-testinghttps://docs.stripe.com/rate-limits.md#load-testing]8;;                                                                      
  • ]8;id=2454386393;https://docs.stripe.com/testing-use-cases.mdTesting use cases]8;; ]8;id=2454386393;https://docs.stripe.com/testing-use-cases.mdhttps://docs.stripe.com/testing-use-cases.md]8;;                                                                        

