
  # Place a hold on a payment method                                                                                                      
                                                                                                                                          
  Separate payment authorization and capture to create a charge now, but capture funds later.                                             
                                                                                                                                          
  ## Start here: Integrate with Stripe using skills and plugins                                                                           
                                                                                                                                          
  Stripe provides skills and plugins for agents to build faster and more accurately. See ]8;id=3531550973;https://docs.stripe.com/skills.mdAgent skills]8;; ]8;id=3531550973;https://docs.stripe.com/skills.mdhttps://docs.stripe.com/skills.md]8;;   
  for more information.                                                                                                                   
                                                                                                                                          
  **Quickstart**: Install the Stripe CLI with npm install -g @stripe/cli and run stripe agent setup.                                      
                                                                                                                                          
  When you create a payment, you can place a hold on an eligible payment method to reserve funds that you can capture later. For example, 
  hotels often authorize a payment in full before a guest arrives, then capture the money when the guest checks out. This is sometimes    
  referred to as *manual capture* (Manually capture funds separately from an authorization).                                              
                                                                                                                                          
  Authorizing a payment guarantees the amount by holding it on the customer’s payment method. If you’re using the API, the                
  ]8;id=3838763538;https://docs.stripe.com/api/charges/object.md#charge_object-payment_method_details-card-capture_beforepayment_]8;;]8;id=3838763538;https://docs.stripe.com/api/charges/object.md#charge_object-payment_method_details-card-capture_beforemethod_]8;;]8;id=3838763538;https://docs.stripe.com/api/charges/object.md#charge_object-payment_method_details-card-capture_beforedetails.card.capture_]8;;]8;id=3838763538;https://docs.stripe.com/api/charges/object.md#charge_object-payment_method_details-card-capture_beforebefore]8;; ]8;id=3838763538;https://docs.stripe.com/api/charges/object.md#charge_object-payment_method_details-card-capture_beforehttps://docs.stripe.com/api/charges/object.md#charge_object-payment_method_details-card-]8;;     
  ]8;id=3838763538;https://docs.stripe.com/api/charges/object.md#charge_object-payment_method_details-card-capture_beforecapture_before]8;; attribute on the charge indicates when the authorization expires.                                                        
                                                                                                                                          
  You need to capture the funds before the authorization expires. If the authorization expires before you capture the funds, the funds are
  released and the payment status changes to canceled. Learn more about ]8;id=3959851893;https://docs.stripe.com/payments/paymentintents/lifecycle.mdstatuses for asynchronous payments]8;;                                
  ]8;id=3959851893;https://docs.stripe.com/payments/paymentintents/lifecycle.mdhttps://docs.stripe.com/payments/paymentintents/lifecycle.md]8;;.                                                                           
                                                                                                                                          
  ## Authorization validity windows                                                                                                       
                                                                                                                                          
  The following tables outline validity windows for authorizing different transaction types.                                              
                                                                                                                                          
  ### Card-not-present transactions                                                                                                       
                                                                                                                                          
   Card brand           | ]8;id=970679986;https://docs.stripe.com/payments/cits-and-mits.mdMerchant-Initiated Transaction[1]]8;; authorization valid… | ]8;id=970679986;https://docs.stripe.com/payments/cits-and-mits.mdCustomer-Initiated Transaction[2]]8;; authorization valid… 
  ----------------------|--------------------------------------------------------|--------------------------------------------------------
   **Visa**             | 5 days*                                                | 7 days                                                 
   **Mastercard**       | 7 days                                                 | 7 days                                                 
   **American Express** | 7 days                                                 | 7 days                                                 
   **Discover**         | 7 days                                                 | 7 days                                                 
                                                                                                                                          
  [1]: Merchant-Initiated Transaction ]8;id=970679986;https://docs.stripe.com/payments/cits-and-mits.mdhttps://docs.stripe.com/payments/cits-and-mits.md]8;;                                                   
  [2]: Customer-Initiated Transaction ]8;id=970679986;https://docs.stripe.com/payments/cits-and-mits.mdhttps://docs.stripe.com/payments/cits-and-mits.md]8;;                                                   
                                                                                                                                          
  * The exact authorization window is 4 days and 18 hours, to allow time for clearing processes.                                          
                                                                                                                                          
  | Stripe and the card network classify transactions as MIT or CIT based on signals of cardholder participation, not solely on API       
  | parameters like ]8;id=2479053329;https://docs.stripe.com/api/payment_intents/create.md#create_payment_intent-off_sessionoff_]8;;]8;id=2479053329;https://docs.stripe.com/api/payment_intents/create.md#create_payment_intent-off_sessionsession]8;; ]8;id=2479053329;https://docs.stripe.com/api/payment_intents/create.md#create_payment_intent-off_sessionhttps://docs.stripe.com/api/payment_intents/create.md#create_payment_intent-off_session]8;;. For example, a   
  | payment with off_session: true might still be classified as a CIT if a CVC is present, resulting in the CIT authorization window      
  | instead.                                                                                                                              
                                                                                                                                          
  ### Card-present transactions (in-person payments)                                                                                      
                                                                                                                                          
   Card brand                                                         | Authorization validity window                                     
  --------------------------------------------------------------------|-------------------------------------------------------------------
   **Visa**                                                           | 5 days*                                                           
   **Mastercard**                                                     | 2 days                                                            
   **American Express**                                               | 2 days                                                            
   **Discover**                                                       | 2 days                                                            
                                                                                                                                          
  * The exact authorization window is 4 days and 18 hours, to allow time for clearing processes.                                          
                                                                                                                                          
  ### 30-day authorization windows in Japan                                                                                               
                                                                                                                                          
  If your account is based in Japan, you can hold JPY-denominated transactions from Visa, Mastercard, JCB, Diners Club, and Discover for  
  up to 30 days. Non-JPY and American Express transactions expire according to the ]8;id=166262568;https://docs.stripe.com/payments/place-a-hold-on-a-payment-method.md#authorization-validity-windowsstandard authorization windows]8;;                         
  ]8;id=166262568;https://docs.stripe.com/payments/place-a-hold-on-a-payment-method.md#authorization-validity-windowshttps://docs.stripe.com/payments/place-a-hold-on-a-payment-method.md#authorization-validity-windows]8;;.                                    
                                                                                                                                          
  ## Payment method limitations                                                                                                           
                                                                                                                                          
  Before implementing, understand the following limitations for authorizing and capturing separately.                                     
                                                                                                                                          
  • Only some payment methods support separate authorization and *capture* (Fulfillment is the process of providing the goods or services 
  purchased by a customer, typically after payment is collected). Some payment methods that support this include cards, Affirm, Afterpay, 
  Cash App Pay, Klarna, and PayPal. Some payment methods that don’t support this include ]8;id=3463150820;https://docs.stripe.com/payments/ach-direct-debit.mdACH]8;; ]8;id=3463150820;https://docs.stripe.com/payments/ach-direct-debit.mdhttps://docs.stripe.com/payments/ach-direct-]8;; 
  ]8;id=3463150820;https://docs.stripe.com/payments/ach-direct-debit.mddebit.md]8;; and ]8;id=1858192016;https://docs.stripe.com/payments/ideal.mdiDEAL]8;; ]8;id=1858192016;https://docs.stripe.com/payments/ideal.mdhttps://docs.stripe.com/payments/ideal.md]8;;. Read more about ]8;id=4055795003;https://docs.stripe.com/payments/payment-methods/payment-method-support.mdpayment method feature support]8;; ]8;id=4055795003;https://docs.stripe.com/payments/payment-methods/payment-method-support.mdhttps://docs.stripe.]8;;       
  ]8;id=4055795003;https://docs.stripe.com/payments/payment-methods/payment-method-support.mdcom/payments/payment-methods/payment-method-support.md]8;;.                                                                                 
  • Beyond what’s outlined in the tables above, other payment methods have different rules and authorization windows:                     
      • Card payments: The amount is typically on hold for 7 days for online payments and 2 days for in-person Terminal payments          
      (depending on the type of transaction and the card network). You can request an extended authorization for certain ]8;id=1499035088;https://docs.stripe.com/payments/extended-authorization.mdonline]8;;           
      ]8;id=1499035088;https://docs.stripe.com/payments/extended-authorization.mdhttps://docs.stripe.com/payments/extended-authorization.md]8;; and ]8;id=4294477214;https://docs.stripe.com/terminal/features/extended-authorizations.mdTerminal payment authorizations]8;; ]8;id=4294477214;https://docs.stripe.com/terminal/features/extended-authorizations.mdhttps://docs.stripe.]8;;                 
      ]8;id=4294477214;https://docs.stripe.com/terminal/features/extended-authorizations.mdcom/terminal/features/extended-authorizations.md]8;; that are eligible for extended validity periods. Card networks may also restrict 1 
      USD authorizations you don’t intend to capture.                                                                                     
      • ]8;id=2548234875;https://docs.stripe.com/payments/affirm/accept-a-payment.md?payment-ui=direct-api#manual-captureAffirm]8;; ]8;id=2548234875;https://docs.stripe.com/payments/affirm/accept-a-payment.md?payment-ui=direct-api#manual-capturehttps://docs.stripe.com/payments/affirm/accept-a-payment.md?payment-ui=direct-api#manual-capture]8;;: If Affirm requires a down
      payment for very large order amounts, they charge the amount during authorization and refund if the payment isn’t captured. You then
      have 30 days to capture the payment balance.                                                                                        
      • ]8;id=3602895092;https://docs.stripe.com/payments/afterpay-clearpay/accept-a-payment.md?web-or-mobile=web&payment-ui=direct-api#manual-captureAfterpay / Clearpay]8;; ]8;id=3602895092;https://docs.stripe.com/payments/afterpay-clearpay/accept-a-payment.md?web-or-mobile=web&payment-ui=direct-api#manual-capturehttps://docs.stripe.com/payments/afterpay-clearpay/accept-a-payment.md?web-or-mobile=web&payment-ui=direct-]8;;   
      ]8;id=3602895092;https://docs.stripe.com/payments/afterpay-clearpay/accept-a-payment.md?web-or-mobile=web&payment-ui=direct-api#manual-captureapi#manual-capture]8;;: During authorization, the customer pays the first repayment installment. Afterpay refunds the payment if it’s   
      never captured. You then have 13 days to capture the payment balance.                                                               
      • ]8;id=2006991500;https://docs.stripe.com/payments/cash-app-pay/accept-a-payment.md?web-or-mobile=web&payment-ui=direct-api#manual-captureCash App Pay]8;; ]8;id=2006991500;https://docs.stripe.com/payments/cash-app-pay/accept-a-payment.md?web-or-mobile=web&payment-ui=direct-api#manual-capturehttps://docs.stripe.com/payments/cash-app-pay/accept-a-payment.md?web-or-mobile=web&payment-ui=direct-api#manual-]8;;    
      ]8;id=2006991500;https://docs.stripe.com/payments/cash-app-pay/accept-a-payment.md?web-or-mobile=web&payment-ui=direct-api#manual-capturecapture]8;;: Valid authorizations must be captured within 7 days to complete a payment.                                                 
      • ]8;id=3317142377;https://docs.stripe.com/payments/klarna/accept-a-payment.md?web-or-mobile=web&payment-ui=direct-api#manual-captureKlarna]8;; ]8;id=3317142377;https://docs.stripe.com/payments/klarna/accept-a-payment.md?web-or-mobile=web&payment-ui=direct-api#manual-capturehttps://docs.stripe.com/payments/klarna/accept-a-payment.md?web-or-mobile=web&payment-ui=direct-api#manual-capture]8;;: You    
      must capture the charge by midnight of the 28th calendar day after the charge request, otherwise the authorization expires. For     
      example, you’d need to capture a charge request at UTC 2020-10-01 14:00 by UTC 2020-10-29 00:00.                                    
      • ]8;id=4058443707;https://docs.stripe.com/payments/paypal/accept-a-payment.md?web-or-mobile=web&payment-ui=direct-api#manual-capturePayPal]8;; ]8;id=4058443707;https://docs.stripe.com/payments/paypal/accept-a-payment.md?web-or-mobile=web&payment-ui=direct-api#manual-capturehttps://docs.stripe.com/payments/paypal/accept-a-payment.md?web-or-mobile=web&payment-ui=direct-api#manual-capture]8;;: Holds  
      the amount for 10 days. Stripe automatically attempts to extend the hold for another 10 days, totalling 20 days. Your ]8;id=3905535842;https://docs.stripe.com/payments/paypal/choose-settlement-preference.mdsettlement]8;;    
      ]8;id=3905535842;https://docs.stripe.com/payments/paypal/choose-settlement-preference.mdpreference]8;; ]8;id=3905535842;https://docs.stripe.com/payments/paypal/choose-settlement-preference.mdhttps://docs.stripe.com/payments/paypal/choose-settlement-preference.md]8;; might affect the authorization period. See       
      ]8;id=4058443707;https://docs.stripe.com/payments/paypal/accept-a-payment.md?web-or-mobile=web&payment-ui=direct-api#manual-captureseparate authorization and capture]8;; ]8;id=4058443707;https://docs.stripe.com/payments/paypal/accept-a-payment.md?web-or-mobile=web&payment-ui=direct-api#manual-capturehttps://docs.stripe.com/payments/paypal/accept-a-payment.md?web-or-mobile=web&payment-ui=direct-]8;; 
      ]8;id=4058443707;https://docs.stripe.com/payments/paypal/accept-a-payment.md?web-or-mobile=web&payment-ui=direct-api#manual-captureapi#manual-capture]8;; for more information.                                                                                            
                                                                                                                                          
                                                                                                                                          
  ## Use the Dashboard to authorize and capture                                                                                           
                                                                                                                                          
  You can authorize a payment and capture funds separately without writing code.                                                          
                                                                                                                                          
  1. In the Dashboard, ]8;id=375519342;https://dashboard.stripe.com/test/payments/newcreate a new payment]8;; ]8;id=375519342;https://dashboard.stripe.com/test/payments/newhttps://dashboard.stripe.com/test/payments/new]8;;. Select **One-time**.                          
  2. When you enter or select the payment method, select **More options** then **Capture funds later**.                                   
                                                                                                                                          
  The payment appears in your ]8;id=911277023;https://dashboard.stripe.com/test/paymentspayments page]8;; ]8;id=911277023;https://dashboard.stripe.com/test/paymentshttps://dashboard.stripe.com/test/payments]8;; as **Uncaptured**.                                 
                                                                                                                                          
  To capture the funds, go to the payment details page and click **Capture**.                                                             
                                                                                                                                          
  ## Tell Stripe to authorize only                                                                                                        
                                                                                                                                          
  #### Checkout Sessions API                                                                                                              
                                                                                                                                          
  To indicate that you want separate authorization and capture, specify ]8;id=3952796034;https://docs.stripe.com/api/checkout/sessions/create.md#create_checkout_session-payment_intent_data-capture_methodcapture_]8;;]8;id=3952796034;https://docs.stripe.com/api/checkout/sessions/create.md#create_checkout_session-payment_intent_data-capture_methodmethod]8;;                                                    
  ]8;id=3952796034;https://docs.stripe.com/api/checkout/sessions/create.md#create_checkout_session-payment_intent_data-capture_methodhttps://docs.stripe.com/api/checkout/sessions/create.md#create_checkout_session-payment_intent_data-capture_method]8;; as manual when       
  creating the Checkout Session. This parameter instructs Stripe to authorize the amount but not capture it on the customer’s payment     
  method.                                                                                                                                 
                                                                                                                                          
    curl https://api.stripe.com/v1/checkout/sessions \                                                                                    
      -u "<<YOUR_SECRET_KEY>>:" \                                                                                                         
      -d "line_items[0][price]={{PRICE_ID}}" \                                                                                            
      -d "line_items[0][quantity]=2" \                                                                                                    
      -d mode=payment \                                                                                                                   
      -d ui_mode=elements \                                                                                                               
      -d "payment_intent_data[capture_method]=manual"                                                                                     
                                                                                                                                          
  With the above approach, you tell Stripe that you can only use “capture after” for a Checkout Session with eligible payment methods.    
                                                                                                                                          
  #### Payment Intents API                                                                                                                
                                                                                                                                          
  To indicate that you want separate authorization and capture, specify ]8;id=4173799167;https://docs.stripe.com/api/payment_intents/create.md#create_payment_intent-capture_methodcapture_]8;;]8;id=4173799167;https://docs.stripe.com/api/payment_intents/create.md#create_payment_intent-capture_methodmethod]8;;                                                    
  ]8;id=4173799167;https://docs.stripe.com/api/payment_intents/create.md#create_payment_intent-capture_methodhttps://docs.stripe.com/api/payment_intents/create.md#create_payment_intent-capture_method]8;; as manual when creating the PaymentIntent.   
  This parameter instructs Stripe to authorize the amount but not capture it on the customer’s payment method.                            
                                                                                                                                          
    curl https://api.stripe.com/v1/payment_intents \                                                                                      
      -u "<<YOUR_SECRET_KEY>>:" \                                                                                                         
      -d amount=1099 \                                                                                                                    
      -d currency=usd \                                                                                                                   
      -d "automatic_payment_methods[enabled]=true" \                                                                                      
      -d capture_method=manual                                                                                                            
                                                                                                                                          
  With the above approach, you tell Stripe that you can only use “capture after” for a PaymentIntent with eligible payment methods. For   
  example, you can’t accept card payments and SEPA Direct Debit (which doesn’t support capture after) for a single PaymentIntent. To      
  accept payment methods that might not all support capture after, you can configure capture-after-per-payment-method by configuring      
  capture_method=manual on the payment_method_options[<payment_method_type>] object.                                                      
                                                                                                                                          
  For example, by configuring payment_method_options[card][capture_method]=manual, you’re placing only card payments on hold. You can     
  manage payment methods from the ]8;id=1727747902;https://dashboard.stripe.com/settings/payment_methodsDashboard]8;; ]8;id=1727747902;https://dashboard.stripe.com/settings/payment_methodshttps://dashboard.stripe.com/settings/payment_methods]8;;. Stripe handles the logic for           
  ]8;id=2437116306;https://docs.stripe.com/payments/payment-methods/dynamic-payment-methods.mddynamically displaying]8;; ]8;id=2437116306;https://docs.stripe.com/payments/payment-methods/dynamic-payment-methods.mdhttps://docs.stripe.com/payments/payment-methods/dynamic-payment-methods.md]8;; the most relevant eligible payment   
  methods to each customer based on factors such as the transaction’s amount, currency, and payment flow.                                 
                                                                                                                                          
    curl https://api.stripe.com/v1/payment_intents \                                                                                      
      -u "<<YOUR_SECRET_KEY>>:" \                                                                                                         
      -d amount=1099 \                                                                                                                    
      -d currency=usd \                                                                                                                   
      -d "automatic_payment_methods[enabled]=true" \                                                                                      
      -d "payment_method_options[card][capture_method]=manual"                                                                            
                                                                                                                                          
  Alternatively, you can list card and sepa_debit using ]8;id=739519528;https://docs.stripe.com/api/payment_intents/create.md#create_payment_intent-allowed_payment_method_typesallowed_]8;;]8;id=739519528;https://docs.stripe.com/api/payment_intents/create.md#create_payment_intent-allowed_payment_method_typespayment_]8;;]8;id=739519528;https://docs.stripe.com/api/payment_intents/create.md#create_payment_intent-allowed_payment_method_typesmethod_]8;;]8;id=739519528;https://docs.stripe.com/api/payment_intents/create.md#create_payment_intent-allowed_payment_method_typestypes]8;;                                                      
  ]8;id=739519528;https://docs.stripe.com/api/payment_intents/create.md#create_payment_intent-allowed_payment_method_typeshttps://docs.stripe.com/api/payment_intents/create.md#create_payment_intent-allowed_payment_method_types]8;;, as in the following example.  
                                                                                                                                          
    curl https://api.stripe.com/v1/payment_intents \                                                                                      
      -u "<<YOUR_SECRET_KEY>>:" \                                                                                                         
      -d amount=1099 \                                                                                                                    
      -d currency=eur \                                                                                                                   
      -d "allowed_payment_method_types[]=card" \                                                                                          
      -d "allowed_payment_method_types[]=sepa_debit" \                                                                                    
      -d "payment_method_options[card][capture_method]=manual"                                                                            
                                                                                                                                          
  Before continuing to capture, attach a payment method with card details to the PaymentIntent, and authorize the card by confirming the  
  PaymentIntent. You can do this by setting the payment_method and confirm fields on the PaymentIntent.                                   
                                                                                                                                          
  | #### Extended authorizations                                                                                                          
  |                                                                                                                                       
  | Usually, an authorization for an online card payment is valid for 7 days. To increase the validity period, you can ]8;id=1499035088;https://docs.stripe.com/payments/extended-authorization.mdplace an extended]8;;  
  | ]8;id=1499035088;https://docs.stripe.com/payments/extended-authorization.mdhold on an online card payment]8;; ]8;id=1499035088;https://docs.stripe.com/payments/extended-authorization.mdhttps://docs.stripe.com/payments/extended-authorization.md]8;;.                                            
                                                                                                                                          
  ## Capture the funds                                                                                                                    
                                                                                                                                          
  | #### Checkout Sessions has a PaymentIntent ID                                                                                         
  |                                                                                                                                       
  | If you’re using the Checkout Sessions API, make sure you use the ]8;id=1076469404;https://docs.stripe.com/api/checkout/sessions/object.md#checkout_session_object-payment_intentPaymentIntent ID]8;;                                                     
  | ]8;id=1076469404;https://docs.stripe.com/api/checkout/sessions/object.md#checkout_session_object-payment_intenthttps://docs.stripe.com/api/checkout/sessions/object.md#checkout_session_object-payment_intent]8;; that is returned in the Checkout       
  Session                                                                                                                                 
  | object.                                                                                                                               
                                                                                                                                          
  After the payment method is authorized, the PaymentIntent ]8;id=1303086519;https://docs.stripe.com/api/payment_intents/object.md#payment_intent_object-statusstatus]8;;                                                                        
  ]8;id=1303086519;https://docs.stripe.com/api/payment_intents/object.md#payment_intent_object-statushttps://docs.stripe.com/api/payment_intents/object.md#payment_intent_object-status]8;; transitions to requires_capture. To capture the      
  authorized funds, make a PaymentIntent ]8;id=1421478179;https://docs.stripe.com/api/payment_intents/capture.mdcapture]8;; ]8;id=1421478179;https://docs.stripe.com/api/payment_intents/capture.mdhttps://docs.stripe.com/api/payment_intents/capture.md]8;; request. This captures the total  
  authorized amount by default. To capture less or (for certain online card payments) more than the initial amount, pass the              
  ]8;id=458741426;https://docs.stripe.com/api/payment_intents/capture.md#capture_payment_intent-amount_to_captureamount_]8;;]8;id=458741426;https://docs.stripe.com/api/payment_intents/capture.md#capture_payment_intent-amount_to_captureto_]8;;]8;id=458741426;https://docs.stripe.com/api/payment_intents/capture.md#capture_payment_intent-amount_to_capturecapture]8;; ]8;id=458741426;https://docs.stripe.com/api/payment_intents/capture.md#capture_payment_intent-amount_to_capturehttps://docs.stripe.com/api/payment_intents/capture.md#capture_payment_intent-amount_to_capture]8;; option. A partial     
  capture automatically releases the remaining amount. If attempting to capture more than the initial amount for an online card payment,  
  refer to the ]8;id=4149480811;https://docs.stripe.com/payments/overcapture.mdovercapture documentation]8;; ]8;id=4149480811;https://docs.stripe.com/payments/overcapture.mdhttps://docs.stripe.com/payments/overcapture.md]8;;.                                                 
                                                                                                                                          
  The following example demonstrates how to capture 7.50 USD of the authorized 10.99 USD payment:                                         
                                                                                                                                          
    curl https://api.stripe.com/v1/payment_intents/pi_123/capture \                                                                       
      -u "<<YOUR_SECRET_KEY>>:" \                                                                                                         
      -d amount_to_capture=750                                                                                                            
                                                                                                                                          
  Although some card payments are eligible for ]8;id=1494386540;https://docs.stripe.com/payments/multicapture.mdmulticapture]8;; ]8;id=1494386540;https://docs.stripe.com/payments/multicapture.mdhttps://docs.stripe.com/payments/multicapture.md]8;;, you can only perform one    
  capture on an authorized payment for most payments. If you partially capture a payment, you can’t perform another capture for the       
  difference. (Instead, consider ]8;id=2684212553;https://docs.stripe.com/payments/save-during-payment.md?payment-ui=elements#save-payment-details-for-future-usesaving the customer’s payment method details for later]8;; ]8;id=2684212553;https://docs.stripe.com/payments/save-during-payment.md?payment-ui=elements#save-payment-details-for-future-usehttps://docs.stripe.com/payments/save-during-]8;;     
  ]8;id=2684212553;https://docs.stripe.com/payments/save-during-payment.md?payment-ui=elements#save-payment-details-for-future-usepayment.md?payment-ui=elements#save-payment-details-for-future-use]8;; and creating future payments as needed.)                             
                                                                                                                                          
  Card statements from some issuers and interfaces from payment methods don’t always distinguish between authorizations and captured      
  (settled) payments, which can sometimes confuse customers.                                                                              
                                                                                                                                          
  Additionally, when a customer completes the payment process on a PaymentIntent with manual capture, it triggers the                     
  payment_intent.amount_capturable_updated event. You can inspect the PaymentIntent’s ]8;id=4163383053;https://docs.stripe.com/api/payment_intents/object.md#payment_intent_object-amount_capturableamount_]8;;]8;id=4163383053;https://docs.stripe.com/api/payment_intents/object.md#payment_intent_object-amount_capturablecapturable]8;;                                   
  ]8;id=4163383053;https://docs.stripe.com/api/payment_intents/object.md#payment_intent_object-amount_capturablehttps://docs.stripe.com/api/payment_intents/object.md#payment_intent_object-amount_capturable]8;; property to see the total amount that you 
  can capture from the PaymentIntent.                                                                                                     
                                                                                                                                          
  ## Cancel the authorization                                                                                                             
                                                                                                                                          
  If you need to cancel an authorization, you can ]8;id=1116213074;https://docs.stripe.com/refunds.md#cancel-paymentcancel the PaymentIntent]8;; ]8;id=1116213074;https://docs.stripe.com/refunds.md#cancel-paymenthttps://docs.stripe.com/refunds.md#cancel-payment]8;;.             
                                                                                                                                          
  ## Capture payment before authorization expires (Private preview)                                                                       
                                                                                                                                          
  You can instruct Stripe to automatically capture before authorization expires instead of manually triggering capture for card payment   
  methods. Use automatic delayed capture to ensure you don’t miss capturing authorized payments. You can also control when the capture    
  occurs using the capture_by parameter.                                                                                                  
                                                                                                                                          
  To enable automatic delayed capture, set ]8;id=1367929003;https://docs.stripe.com/api/payment_intents/create.md#create_payment_intent-payment_method_options-cardcapture_]8;;]8;id=1367929003;https://docs.stripe.com/api/payment_intents/create.md#create_payment_intent-payment_method_options-cardmethod]8;; ]8;id=1367929003;https://docs.stripe.com/api/payment_intents/create.md#create_payment_intent-payment_method_options-cardhttps://docs.stripe.com/api/payment_intents/create.md#create_payment_intent-]8;;    
  ]8;id=1367929003;https://docs.stripe.com/api/payment_intents/create.md#create_payment_intent-payment_method_options-cardpayment_method_options-card]8;; as automatic_delayed on the PaymentIntent:                                                                  
                                                                                                                                          
    curl https://api.stripe.com/v1/payment_intents \                                                                                      
      -u "<<YOUR_SECRET_KEY>>:" \                                                                                                         
      -d amount=1099 \                                                                                                                    
      -d currency=usd \                                                                                                                   
      -d "automatic_payment_methods[enabled]=true" \                                                                                      
      -d "payment_method_options[card][capture_method]=automatic_delayed"                                                                 
                                                                                                                                          
  With this approach, Stripe captures your card payment before the authorization expires, triggering the capture about 6 hours before the 
  expiration time. This serves as a backup process to make sure we capture authorized payments before expiration. You can still manually  
  ]8;id=1421478179;https://docs.stripe.com/api/payment_intents/capture.mdcapture]8;; ]8;id=1421478179;https://docs.stripe.com/api/payment_intents/capture.mdhttps://docs.stripe.com/api/payment_intents/capture.md]8;; or ]8;id=1116213074;https://docs.stripe.com/refunds.md#cancel-paymentcancel]8;; ]8;id=1116213074;https://docs.stripe.com/refunds.md#cancel-paymenthttps://docs.stripe.com/refunds.md#cancel-payment]8;; the          
  PaymentIntent before it’s automatically captured.                                                                                       
                                                                                                                                          
  ### Control capture timing                                                                                                              
                                                                                                                                          
  Use the capture_by parameter to control when funds are captured from the customer’s account. The following values are supported:        
                                                                                                                                          
  • auth_expiry: Captures funds before the authorization expires. This is the default behavior when capture_by is omitted.                
  • end_of_day: Captures funds at the end of the day (UTC).                                                                               
  • target_delay: Captures funds after a specified delay. When using target_delay, provide a capture_delay hash with days or hours to     
  specify the delay period.                                                                                                               
                                                                                                                                          
  The following example uses capture_by set to target_delay with a capture_delay of 3 days to automatically capture the PaymentIntent 3   
  days after successful authorization:                                                                                                    
                                                                                                                                          
    curl https://api.stripe.com/v1/payment_intents \                                                                                      
      -u "<<YOUR_SECRET_KEY>>:" \                                                                                                         
      -d amount=1099 \                                                                                                                    
      -d currency=usd \                                                                                                                   
      -d "automatic_payment_methods[enabled]=true" \                                                                                      
      -d "payment_method_options[card][capture_method]=automatic_delayed" \                                                               
      -d "payment_method_options[card][capture_by]=target_delay" \                                                                        
      -d "payment_method_options[card][capture_delay][days]=3"                                                                            
                                                                                                                                          
  This is useful if you know the amount of time needed to perform actions between authorization and capture, and to make sure you capture 
  the payment before the authorization expires. You can set both days and hours as long as the total delay doesn’t exceed 30 days.        
                                                                                                                                          
  | With capture_method=automatic_delayed, Stripe prioritizes capturing the payment before authorization expiration. If the authorization 
  | window is shorter than the specified delay period, we capture the PaymentIntent before expiration, ignoring the delay period.         
                                                                                                                                          
  ### Interested in getting early access to automatic delayed captures?                                                                   
                                                                                                                                          
  Provide your email address below, and our team will contact you soon.                                                                   
                                                                                                                                          
    curl https://docs.stripe.com/preview/register \                                                                                       
      -X POST \                                                                                                                           
      -H "Content-Type: application/json" \                                                                                               
      -H "Referer: https://docs.stripe.com/payments/place-a-hold-on-a-payment-method" \                                                   
      -d '{"email": "EMAIL", "preview": "automatic_delayed_capture_beta_preview"}'                                                        
                                                                                                                                          
  ## See also                                                                                                                             
                                                                                                                                          
  • ]8;id=102380303;https://docs.stripe.com/payments/accept-a-payment.md?payment-ui=checkout&ui=stripe-hosted#auth-and-captureSeparate authorization and capture with Checkout]8;; ]8;id=102380303;https://docs.stripe.com/payments/accept-a-payment.md?payment-ui=checkout&ui=stripe-hosted#auth-and-capturehttps://docs.stripe.com/payments/accept-a-payment.md?payment-ui=checkout&ui=stripe-]8;;  
  ]8;id=102380303;https://docs.stripe.com/payments/accept-a-payment.md?payment-ui=checkout&ui=stripe-hosted#auth-and-capturehosted#auth-and-capture]8;;                                                                                                                 
  • ]8;id=1499035088;https://docs.stripe.com/payments/extended-authorization.mdPlace an extended hold on an online card payment]8;; ]8;id=1499035088;https://docs.stripe.com/payments/extended-authorization.mdhttps://docs.stripe.com/payments/extended-authorization.md]8;;                           

