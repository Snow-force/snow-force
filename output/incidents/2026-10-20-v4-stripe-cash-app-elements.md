
  # Cash App Pay payments                                                                                                                 
                                                                                                                                          
  Add support for Cash App Pay to your integration.                                                                                       
                                                                                                                                          
  ## Start here: Integrate with Stripe using skills and plugins                                                                           
                                                                                                                                          
  Stripe provides skills and plugins for agents to build faster and more accurately. See ]8;id=3531550973;https://docs.stripe.com/skills.mdAgent skills]8;; ]8;id=3531550973;https://docs.stripe.com/skills.mdhttps://docs.stripe.com/skills.md]8;;   
  for more information.                                                                                                                   
                                                                                                                                          
  **Quickstart**: Install the Stripe CLI with npm install -g @stripe/cli and run stripe agent setup.                                      
                                                                                                                                          
  # Payment Intents API                                                                                                                   
                                                                                                                                          
  This guide shows you how to embed a custom Stripe payment form in your website or application using the ]8;id=1358744166;https://docs.stripe.com/payments/payment-element.mdPayment Element]8;;                 
  ]8;id=1358744166;https://docs.stripe.com/payments/payment-element.mdhttps://docs.stripe.com/payments/payment-element.md]8;;. The Payment Element allows you to support Cash App Pay and other payment methods   
  automatically. For advanced configurations and customizations, refer to the ]8;id=4194439948;https://docs.stripe.com/payments/accept-a-payment.mdAccept a Payment]8;; ]8;id=4194439948;https://docs.stripe.com/payments/accept-a-payment.mdhttps://docs.stripe.com/payments/accept-a-]8;; 
  ]8;id=4194439948;https://docs.stripe.com/payments/accept-a-payment.mdpayment.md]8;; integration guide.                                                                                                           
                                                                                                                                          
  ## Set up Stripe [Server-side]                                                                                                          
                                                                                                                                          
  First, you need a Stripe account. ]8;id=512491702;https://dashboard.stripe.com/registerRegister now]8;; ]8;id=512491702;https://dashboard.stripe.com/registerhttps://dashboard.stripe.com/register]8;;.                                                   
                                                                                                                                          
  Use our official libraries for access to the Stripe API from your application:                                                          
                                                                                                                                          
  #### Ruby                                                                                                                               
                                                                                                                                          
    # Available as a gem                                                                                                                  
    sudo gem install stripe                                                                                                               
                                                                                                                                          
    # If you use bundler, you can add this line to your Gemfile                                                                           
    gem 'stripe'                                                                                                                          
                                                                                                                                          
  ## Create a PaymentIntent [Server-side]                                                                                                 
                                                                                                                                          
  Stripe uses a ]8;id=2295290564;https://docs.stripe.com/api/payment_intents.mdPaymentIntent]8;; ]8;id=2295290564;https://docs.stripe.com/api/payment_intents.mdhttps://docs.stripe.com/api/payment_intents.md]8;; object to represent your intent to collect payment from a    
  customer, tracking charge attempts and payment state changes throughout the process.                                                    
                                                                                                                                          
  #### Manage payment methods from the Dashboard                                                                                          
                                                                                                                                          
  Create a PaymentIntent on your server with an amount and currency. You can manage payment methods from the ]8;id=1727747902;https://dashboard.stripe.com/settings/payment_methodsDashboard]8;;                    
  ]8;id=1727747902;https://dashboard.stripe.com/settings/payment_methodshttps://dashboard.stripe.com/settings/payment_methods]8;;. Stripe handles the return of eligible payment methods based on factors such as   
  the transaction’s amount, currency, and payment flow. Before creating the Payment Intent, make sure to turn **Cash App Pay** on in the  
  ]8;id=1727747902;https://dashboard.stripe.com/settings/payment_methodspayment methods settings]8;; ]8;id=1727747902;https://dashboard.stripe.com/settings/payment_methodshttps://dashboard.stripe.com/settings/payment_methods]8;; page.                                                    
                                                                                                                                          
  Always decide how much to charge on the server side, a trusted environment, as opposed to the client. This prevents malicious customers 
  from being able to choose their own prices.                                                                                             
                                                                                                                                          
    curl https://api.stripe.com/v1/payment_intents \                                                                                      
      -u "<<YOUR_SECRET_KEY>>:" \                                                                                                         
      -d amount=1099 \                                                                                                                    
      -d currency=usd \                                                                                                                   
      -d "automatic_payment_methods[enabled]=true"                                                                                        
                                                                                                                                          
  #### List payment methods manually                                                                                                      
                                                                                                                                          
  If you don’t want to use the Dashboard, or you want to manually specify payment methods, you can list them using the                    
  allowed_payment_method_types parameter.                                                                                                 
                                                                                                                                          
  Create a PaymentIntent on your server with an amount, currency, and a list of payment methods. Always decide how much to charge on the  
  server side, a trusted environment, as opposed to the client. This prevents malicious customers from being able to choose their own     
  prices.                                                                                                                                 
                                                                                                                                          
    curl https://api.stripe.com/v1/payment_intents \                                                                                      
      -u "<<YOUR_SECRET_KEY>>:" \                                                                                                         
      -d amount=1099 \                                                                                                                    
      -d currency=usd \                                                                                                                   
      -d "allowed_payment_method_types[]=cashapp"                                                                                         
                                                                                                                                          
  ### Retrieve the client secret                                                                                                          
                                                                                                                                          
  The PaymentIntent includes a *client secret* (The client secret is a unique key returned from Stripe as part of a PaymentIntent. This   
  key lets the client access important fields from the PaymentIntent (status, amount, currency) while hiding sensitive ones (metadata,    
  customer)) that the client side uses to securely complete the payment process. You can use different approaches to pass the client      
  secret to the client side.                                                                                                              
                                                                                                                                          
  #### Single-page application                                                                                                            
                                                                                                                                          
  Retrieve the client secret from an endpoint on your server, using the browser’s fetch function. This approach is best if your client    
  side is a single-page application, particularly one built with a modern frontend framework like React. Create the server endpoint that  
  serves the client secret:                                                                                                               
                                                                                                                                          
  #### Ruby                                                                                                                               
                                                                                                                                          
    get '/secret' do                                                                                                                      
      intent = # ... Create or retrieve the PaymentIntent                                                                                 
      {client_secret: intent.client_secret}.to_json                                                                                       
    end                                                                                                                                   
                                                                                                                                          
  And then fetch the client secret with JavaScript on the client side:                                                                    
                                                                                                                                          
    (async () => {                                                                                                                        
      const response = await fetch('/secret');                                                                                            
      const {client_secret: clientSecret} = await response.json();                                                                        
      // Render the form using the clientSecret                                                                                           
    })();                                                                                                                                 
                                                                                                                                          
  #### Server-side rendering                                                                                                              
                                                                                                                                          
  Pass the client secret to the client from your server. This approach works best if your application generates static content on the     
  server before sending it to the browser.                                                                                                
                                                                                                                                          
  Add the ]8;id=2634614859;https://docs.stripe.com/api/payment_intents/object.md#payment_intent_object-client_secretclient_]8;;]8;id=2634614859;https://docs.stripe.com/api/payment_intents/object.md#payment_intent_object-client_secretsecret]8;; ]8;id=2634614859;https://docs.stripe.com/api/payment_intents/object.md#payment_intent_object-client_secrethttps://docs.stripe.com/api/payment_intents/object.md#payment_intent_object-client_secret]8;; in your checkout form.  
  In your server-side code, retrieve the client secret from the PaymentIntent:                                                            
                                                                                                                                          
  #### Ruby                                                                                                                               
                                                                                                                                          
    <form id="payment-form" data-secret="<%= @intent.client_secret %>">                                                                   
      <div id="payment-element">                                                                                                          
        <!-- placeholder for Elements -->                                                                                                 
      </div>                                                                                                                              
      <button id="submit">Submit</button>                                                                                                 
    </form>                                                                                                                               
                                                                                                                                          
    get '/checkout' do                                                                                                                    
      @intent = # ... Fetch or create the PaymentIntent                                                                                   
      erb :checkout                                                                                                                       
    end                                                                                                                                   
                                                                                                                                          
  ## Collect payment details [Client-side]                                                                                                
                                                                                                                                          
  Collect payment details on the client with the ]8;id=1358744166;https://docs.stripe.com/payments/payment-element.mdPayment Element]8;; ]8;id=1358744166;https://docs.stripe.com/payments/payment-element.mdhttps://docs.stripe.com/payments/payment-element.md]8;;. The Payment Element 
  is a prebuilt UI component that simplifies collecting payment details for a variety of payment methods.                                 
                                                                                                                                          
  The Payment Element contains an iframe that securely sends payment information to Stripe over an HTTPS connection. Avoid placing the    
  Payment Element within another iframe because some payment methods require redirecting to another page for payment confirmation.        
                                                                                                                                          
  If you choose to use an iframe and want to accept Apple Pay or Google Pay, the iframe must have the ]8;id=3316036163;https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe#attr-allowpaymentrequestallow]8;;                               
  ]8;id=3316036163;https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe#attr-allowpaymentrequesthttps://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe#attr-allowpaymentrequest]8;; attribute set to equal "payment *".           
                                                                                                                                          
  The checkout page address must start with https:// rather than http:// for your integration to work. You can test your integration      
  without using HTTPS, but remember to ]8;id=4179990666;https://docs.stripe.com/security/guide.md#tlsenable it]8;; ]8;id=4179990666;https://docs.stripe.com/security/guide.md#tlshttps://docs.stripe.com/security/guide.md#tls]8;; when you’re ready to accept live payments. 
                                                                                                                                          
  #### HTML + JS                                                                                                                          
                                                                                                                                          
  ### Set up Stripe.js                                                                                                                    
                                                                                                                                          
  The Payment Element is automatically available as a feature of Stripe.js. Include the Stripe.js script on your checkout page by adding  
  it to the head of your HTML file. Always load Stripe.js directly from js.stripe.com to remain PCI compliant. Don’t include the script in
  a bundle or host a copy of it yourself.                                                                                                 
                                                                                                                                          
    <head>                                                                                                                                
      <title>Checkout</title>                                                                                                             
      <script src="https://js.stripe.com/endive/stripe.js"></script>                                                                      
    </head>                                                                                                                               
                                                                                                                                          
  Create an instance of Stripe with the following JavaScript on your checkout page:                                                       
                                                                                                                                          
    // Set your publishable key: remember to change this to your live publishable key in production                                       
    // See your keys here: https://dashboard.stripe.com/apikeys                                                                           
    const stripe = Stripe('<<YOUR_PUBLISHABLE_KEY>>');                                                                                    
                                                                                                                                          
  ### Add the Payment Element to your payment page                                                                                        
                                                                                                                                          
  The Payment Element needs a place to live on your payment page. Create an empty DOM node (container) with a unique ID in your payment   
  form:                                                                                                                                   
                                                                                                                                          
    <form id="payment-form">                                                                                                              
      <div id="payment-element">                                                                                                          
        <!-- Elements will create form elements here -->                                                                                  
      </div>                                                                                                                              
      <button id="submit">Submit</button>                                                                                                 
      <div id="error-message">                                                                                                            
        <!-- Display error message to your customers here -->                                                                             
      </div>                                                                                                                              
    </form>                                                                                                                               
                                                                                                                                          
  When the previous form loads, create an instance of the Payment Element and mount it to the container DOM node. Pass the ]8;id=2634614859;https://docs.stripe.com/api/payment_intents/object.md#payment_intent_object-client_secretclient secret]8;;  
  ]8;id=2634614859;https://docs.stripe.com/api/payment_intents/object.md#payment_intent_object-client_secrethttps://docs.stripe.com/api/payment_intents/object.md#payment_intent_object-client_secret]8;; from the previous step into options when you  
  create the ]8;id=3577445470;https://docs.stripe.com/js/elements_object/createElements]8;; ]8;id=3577445470;https://docs.stripe.com/js/elements_object/createhttps://docs.stripe.com/js/elements_object/create]8;; instance:                                                         
                                                                                                                                          
  Handle the client secret carefully because it can complete the charge. Don’t log it, embed it in URLs, or expose it to anyone but the   
  customer.                                                                                                                               
                                                                                                                                          
    const options = {                                                                                                                     
      clientSecret: '{{CLIENT_SECRET}}',                                                                                                  
      // Fully customizable with appearance API.                                                                                          
      appearance: {/*...*/},                                                                                                              
    };                                                                                                                                    
                                                                                                                                          
    // Set up Stripe.js and Elements to use in checkout form, passing the client secret obtained in a previous step                       
    const elements = stripe.elements(options);                                                                                            
    // Optional: Autofill user's saved payment methods. If the customer's                                                                 
    // email is known when the page is loaded, you can pass the email                                                                     
    // to the contactDetailsElement on mount:                                                                                             
    //                                                                                                                                    
    //   contactDetailsElement.mount("#contact-details-element",  {                                                                       
    //     defaultValues: {                                                                                                               
    //       email: 'jenny.rosen@example.com',                                                                                            
    //     }                                                                                                                              
    //   })                                                                                                                               
                                                                                                                                          
    // Create and mount the Payment Element                                                                                               
    const paymentElementOptions = { layout: 'accordion'};                                                                                 
    const paymentElement = elements.create('payment', paymentElementOptions);                                                             
    paymentElement.mount('#payment-element');                                                                                             
                                                                                                                                          
                                                                                                                                          
  #### React                                                                                                                              
                                                                                                                                          
  ### Set up Stripe.js                                                                                                                    
                                                                                                                                          
  Install ]8;id=1355446221;https://www.npmjs.com/package/@stripe/react-stripe-jsReact Stripe.js]8;; ]8;id=1355446221;https://www.npmjs.com/package/@stripe/react-stripe-jshttps://www.npmjs.com/package/@stripe/react-stripe-js]8;; and the ]8;id=3138422251;https://www.npmjs.com/package/@stripe/stripe-jsStripe.js loader]8;;                                  
  ]8;id=3138422251;https://www.npmjs.com/package/@stripe/stripe-jshttps://www.npmjs.com/package/@stripe/stripe-js]8;; from the npm public registry:                                                           
                                                                                                                                          
    npm install --save @stripe/react-stripe-js @stripe/stripe-js                                                                          
                                                                                                                                          
  ### Add and configure the Elements provider to your payment page                                                                        
                                                                                                                                          
  To use the Payment Element component, wrap your checkout page component in an ]8;id=171912916;https://docs.stripe.com/sdks/stripejs-react.md?ui=elements#elements-providerElements provider]8;; ]8;id=171912916;https://docs.stripe.com/sdks/stripejs-react.md?ui=elements#elements-providerhttps://docs.stripe.com/sdks/stripejs-]8;;  
  ]8;id=171912916;https://docs.stripe.com/sdks/stripejs-react.md?ui=elements#elements-providerreact.md?ui=elements#elements-provider]8;;. Call loadStripe with your publishable key, and pass the returned Promise to the Elements        
  provider. Also pass the ]8;id=2634614859;https://docs.stripe.com/api/payment_intents/object.md#payment_intent_object-client_secretclient secret]8;; ]8;id=2634614859;https://docs.stripe.com/api/payment_intents/object.md#payment_intent_object-client_secrethttps://docs.stripe.com/api/payment_intents/object.md#payment_intent_object-client_secret]8;; from the
  previous step as options to the Elements provider.                                                                                      
                                                                                                                                          
    import React from 'react';                                                                                                            
    import ReactDOM from 'react-dom';                                                                                                     
    import {Elements} from '@stripe/react-stripe-js';                                                                                     
    import {loadStripe} from '@stripe/stripe-js';                                                                                         
                                                                                                                                          
    import CheckoutForm from './CheckoutForm';                                                                                            
                                                                                                                                          
    // Make sure to call `loadStripe` outside of a component's render to avoid                                                            
    // recreating the `Stripe` object on every render.                                                                                    
    const stripePromise = loadStripe('<<YOUR_PUBLISHABLE_KEY>>');                                                                         
                                                                                                                                          
    function App() {                                                                                                                      
      const options = {                                                                                                                   
        // passing the client secret obtained in step 3                                                                                   
        clientSecret: '{{CLIENT_SECRET}}',                                                                                                
        // Fully customizable with appearance API.                                                                                        
        appearance: {/*...*/},                                                                                                            
      };                                                                                                                                  
                                                                                                                                          
      return (                                                                                                                            
        <Elements stripe={stripePromise} options={options}>                                                                               
          <CheckoutForm />                                                                                                                
        </Elements>                                                                                                                       
      );                                                                                                                                  
    };                                                                                                                                    
                                                                                                                                          
    ReactDOM.render(<App />, document.getElementById('root'));                                                                            
                                                                                                                                          
  ### Add the Payment Element component                                                                                                   
                                                                                                                                          
  Use the PaymentElement component to build your form:                                                                                    
                                                                                                                                          
    import React from 'react';                                                                                                            
    import {PaymentElement} from '@stripe/react-stripe-js';                                                                               
                                                                                                                                          
    const CheckoutForm = () => {                                                                                                          
      return (                                                                                                                            
        <form>                                                                                                                            
          // Optional: Autofill user's saved payment methods. If the customer's                                                           
          // email is known when the page is loaded, you can pass the email                                                               
          // to the contactDetailsElement                                                                                                 
          //                                                                                                                              
          // <ContactDetailsElement id="contact-details-element"                                                                          
            // Prefill the email field like so:                                                                                           
            // options={{defaultValues: {email: 'foo@bar.com'}}}                                                                          
          // />                                                                                                                           
          <PaymentElement />                                                                                                              
          <button>Submit</button>                                                                                                         
        </form>                                                                                                                           
      );                                                                                                                                  
    };                                                                                                                                    
                                                                                                                                          
    export default CheckoutForm;                                                                                                          
                                                                                                                                          
  ## Submit the payment to Stripe [Client-side]                                                                                           
                                                                                                                                          
  Use ]8;id=3454053796;https://docs.stripe.com/js/payment_intents/confirm_paymentstripe.confirmPayment]8;; ]8;id=3454053796;https://docs.stripe.com/js/payment_intents/confirm_paymenthttps://docs.stripe.com/js/payment_intents/confirm_payment]8;; to complete the payment using details from the     
  Payment Element. Provide a ]8;id=2978265817;https://docs.stripe.com/api/payment_intents/create.md#create_payment_intent-return_urlreturn_]8;;]8;id=2978265817;https://docs.stripe.com/api/payment_intents/create.md#create_payment_intent-return_urlurl]8;; ]8;id=2978265817;https://docs.stripe.com/api/payment_intents/create.md#create_payment_intent-return_urlhttps://docs.stripe.com/api/payment_intents/create.md#create_payment_intent-return_url]8;; to this    
  function to indicate where Stripe should redirect the user after they complete the payment. Your user may be first redirected to an     
  intermediate site, like a bank authorization page, before being redirected to the return_url. Card payments immediately redirect to the 
  return_url when a payment is successful.                                                                                                
                                                                                                                                          
  #### HTML + JS                                                                                                                          
                                                                                                                                          
    const form = document.getElementById('payment-form');                                                                                 
                                                                                                                                          
    form.addEventListener('submit', async (event) => {                                                                                    
      event.preventDefault();                                                                                                             
                                                                                                                                          
      const {error} = await stripe.confirmPayment({                                                                                       
        //`Elements` instance that was used to create the Payment Element                                                                 
        elements,                                                                                                                         
        confirmParams: {                                                                                                                  
          return_url: 'https://example.com/order/123/complete',                                                                           
        },                                                                                                                                
      });                                                                                                                                 
                                                                                                                                          
      if (error) {                                                                                                                        
        // This point will only be reached if there is an immediate error when                                                            
        // confirming the payment. Show error to your customer (for example, payment                                                      
        // details incomplete)                                                                                                            
        const messageContainer = document.querySelector('#error-message');                                                                
        messageContainer.textContent = error.message;                                                                                     
      } else {                                                                                                                            
        // Your customer will be redirected to your `return_url`. For some payment                                                        
        // methods like iDEAL, your customer will be redirected to an intermediate                                                        
        // site first to authorize the payment, then redirected to the `return_url`.                                                      
      }                                                                                                                                   
    });                                                                                                                                   
                                                                                                                                          
  #### React                                                                                                                              
                                                                                                                                          
  To call ]8;id=3454053796;https://docs.stripe.com/js/payment_intents/confirm_paymentstripe.confirmPayment]8;; ]8;id=3454053796;https://docs.stripe.com/js/payment_intents/confirm_paymenthttps://docs.stripe.com/js/payment_intents/confirm_payment]8;; from your payment form component, use the      
  ]8;id=2295169693;https://docs.stripe.com/sdks/stripejs-react.md?ui=elements#usestripe-hookuseStripe]8;; ]8;id=2295169693;https://docs.stripe.com/sdks/stripejs-react.md?ui=elements#usestripe-hookhttps://docs.stripe.com/sdks/stripejs-react.md?ui=elements#usestripe-hook]8;; and ]8;id=2772014445;https://docs.stripe.com/sdks/stripejs-react.md?ui=elements#useelements-hookuseElements]8;;                                     
  ]8;id=2772014445;https://docs.stripe.com/sdks/stripejs-react.md?ui=elements#useelements-hookhttps://docs.stripe.com/sdks/stripejs-react.md?ui=elements#useelements-hook]8;; hooks.                                                      
                                                                                                                                          
  If you prefer traditional class components over hooks, you can instead use an ]8;id=3943180593;https://docs.stripe.com/sdks/stripejs-react.md?ui=elements#elements-consumerElementsConsumer]8;; ]8;id=3943180593;https://docs.stripe.com/sdks/stripejs-react.md?ui=elements#elements-consumerhttps://docs.stripe.com/sdks/stripejs-]8;;   
  ]8;id=3943180593;https://docs.stripe.com/sdks/stripejs-react.md?ui=elements#elements-consumerreact.md?ui=elements#elements-consumer]8;;.                                                                                                 
                                                                                                                                          
    import React, {useState} from 'react';                                                                                                
    import {useStripe, useElements, PaymentElement} from '@stripe/react-stripe-js';                                                       
                                                                                                                                          
    const CheckoutForm = () => {                                                                                                          
      const stripe = useStripe();                                                                                                         
      const elements = useElements();                                                                                                     
                                                                                                                                          
      const [errorMessage, setErrorMessage] = useState(null);                                                                             
                                                                                                                                          
      const handleSubmit = async (event) => {                                                                                             
        // We don't want to let default form submission happen here,                                                                      
        // which would refresh the page.                                                                                                  
        event.preventDefault();                                                                                                           
                                                                                                                                          
        if (!stripe || !elements) {                                                                                                       
          // Stripe.js hasn't yet loaded.                                                                                                 
          // Make sure to disable form submission until Stripe.js has loaded.                                                             
          return;                                                                                                                         
        }                                                                                                                                 
                                                                                                                                          
        const {error} = await stripe.confirmPayment({                                                                                     
          //`Elements` instance that was used to create the Payment Element                                                               
          elements,                                                                                                                       
          confirmParams: {                                                                                                                
            return_url: 'https://example.com/order/123/complete',                                                                         
          },                                                                                                                              
        });                                                                                                                               
                                                                                                                                          
                                                                                                                                          
        if (error) {                                                                                                                      
          // This point will only be reached if there is an immediate error when                                                          
          // confirming the payment. Show error to your customer (for example, payment                                                    
          // details incomplete)                                                                                                          
          setErrorMessage(error.message);                                                                                                 
        } else {                                                                                                                          
          // Your customer will be redirected to your `return_url`. For some payment                                                      
          // methods like iDEAL, your customer will be redirected to an intermediate                                                      
          // site first to authorize the payment, then redirected to the `return_url`.                                                    
        }                                                                                                                                 
      };                                                                                                                                  
                                                                                                                                          
      return (                                                                                                                            
        <form onSubmit={handleSubmit}>                                                                                                    
          <PaymentElement />                                                                                                              
          <button disabled={!stripe}>Submit</button>                                                                                      
          {/* Show error message to your customers */}                                                                                    
          {errorMessage && <div>{errorMessage}</div>}                                                                                     
        </form>                                                                                                                           
      );                                                                                                                                  
    };                                                                                                                                    
                                                                                                                                          
    export default CheckoutForm;                                                                                                          
                                                                                                                                          
  Make sure the return_url corresponds to a page on your website that provides the status of the payment. When Stripe redirects the       
  customer to the return_url, we provide the following URL query parameters:                                                              
                                                                                                                                          
   Parameter                                                          | Description                                                       
  --------------------------------------------------------------------|-------------------------------------------------------------------
   payment_intent                                                     | The unique identifier for the PaymentIntent.                      
   payment_intent_client_secret                                       | The ]8;id=2634614859;https://docs.stripe.com/api/payment_intents/object.md#payment_intent_object-client_secretclient secret[1]]8;; of the PaymentIntent object.                 
                                                                                                                                          
  [1]: client secret ]8;id=2634614859;https://docs.stripe.com/api/payment_intents/object.md#payment_intent_object-client_secrethttps://docs.stripe.com/api/payment_intents/object.md#payment_intent_object-client_secret]8;;                            
                                                                                                                                          
  | If you have tooling that tracks the customer’s browser session, you might need to add the stripe.com domain to the referrer exclude   
  | list. Redirects cause some tools to create new sessions, which prevents you from tracking the complete session.                       
                                                                                                                                          
  Use one of the query parameters to retrieve the PaymentIntent. Inspect the ]8;id=3959851893;https://docs.stripe.com/payments/paymentintents/lifecycle.mdstatus of the PaymentIntent]8;;                                  
  ]8;id=3959851893;https://docs.stripe.com/payments/paymentintents/lifecycle.mdhttps://docs.stripe.com/payments/paymentintents/lifecycle.md]8;; to decide what to show your customers. You can also append your own query  
  parameters when providing the return_url, which persist through the redirect process.                                                   
                                                                                                                                          
  #### HTML + JS                                                                                                                          
                                                                                                                                          
                                                                                                                                          
    // Initialize Stripe.js using your publishable key                                                                                    
    const stripe = Stripe('<<YOUR_PUBLISHABLE_KEY>>');                                                                                    
                                                                                                                                          
    // Retrieve the "payment_intent_client_secret" query parameter appended to                                                            
    // your return_url by Stripe.js                                                                                                       
    const clientSecret = new URLSearchParams(window.location.search).get(                                                                 
      'payment_intent_client_secret'                                                                                                      
    );                                                                                                                                    
                                                                                                                                          
    // Retrieve the PaymentIntent                                                                                                         
    stripe.retrievePaymentIntent(clientSecret).then(({paymentIntent}) => {                                                                
      const message = document.querySelector('#message')                                                                                  
                                                                                                                                          
      // Inspect the PaymentIntent `status` to indicate the status of the payment                                                         
      // to your customer.                                                                                                                
      //                                                                                                                                  
      // Some payment methods will [immediately succeed or fail][0] upon                                                                  
      // confirmation, while others will first enter a `processing` state.                                                                
      //                                                                                                                                  
      // [0]: https://stripe.com/docs/payments/payment-methods#payment-notification                                                       
      switch (paymentIntent.status) {                                                                                                     
        case 'succeeded':                                                                                                                 
          message.innerText = 'Success! Payment received.';                                                                               
          break;                                                                                                                          
                                                                                                                                          
        case 'processing':                                                                                                                
          message.innerText = "Payment processing. We'll update you when payment is received.";                                           
          break;                                                                                                                          
                                                                                                                                          
        case 'requires_payment_method':                                                                                                   
          message.innerText = 'Payment failed. Please try another payment method.';                                                       
          // Redirect your user back to your payment page to attempt collecting                                                           
          // payment again                                                                                                                
          break;                                                                                                                          
                                                                                                                                          
        default:                                                                                                                          
          message.innerText = 'Something went wrong.';                                                                                    
          break;                                                                                                                          
      }                                                                                                                                   
    });                                                                                                                                   
                                                                                                                                          
  #### React                                                                                                                              
                                                                                                                                          
    import React, {useState, useEffect} from 'react';                                                                                     
    import {useStripe} from '@stripe/react-stripe-js';                                                                                    
                                                                                                                                          
    const PaymentStatus = () => {                                                                                                         
      const stripe = useStripe();                                                                                                         
      const [message, setMessage] = useState(null);                                                                                       
                                                                                                                                          
      useEffect(() => {                                                                                                                   
        if (!stripe) {                                                                                                                    
          return;                                                                                                                         
        }                                                                                                                                 
                                                                                                                                          
        // Retrieve the "payment_intent_client_secret" query parameter appended to                                                        
        // your return_url by Stripe.js                                                                                                   
        const clientSecret = new URLSearchParams(window.location.search).get(                                                             
          'payment_intent_client_secret'                                                                                                  
        );                                                                                                                                
                                                                                                                                          
        // Retrieve the PaymentIntent                                                                                                     
        stripe                                                                                                                            
          .retrievePaymentIntent(clientSecret)                                                                                            
          .then(({paymentIntent}) => {                                                                                                    
            // Inspect the PaymentIntent `status` to indicate the status of the payment                                                   
            // to your customer.                                                                                                          
            //                                                                                                                            
            // Some payment methods will [immediately succeed or fail][0] upon                                                            
            // confirmation, while others will first enter a `processing` state.                                                          
            //                                                                                                                            
            // [0]: https://stripe.com/docs/payments/payment-methods#payment-notification                                                 
            switch (paymentIntent.status) {                                                                                               
              case 'succeeded':                                                                                                           
                setMessage('Success! Payment received.');                                                                                 
                break;                                                                                                                    
                                                                                                                                          
              case 'processing':                                                                                                          
                setMessage("Payment processing. We'll update you when payment is received.");                                             
                break;                                                                                                                    
                                                                                                                                          
              case 'requires_payment_method':                                                                                             
                // Redirect your user back to your payment page to attempt collecting                                                     
                // payment again                                                                                                          
                setMessage('Payment failed. Please try another payment method.');                                                         
                break;                                                                                                                    
                                                                                                                                          
              default:                                                                                                                    
                setMessage('Something went wrong.');                                                                                      
                break;                                                                                                                    
            }                                                                                                                             
          });                                                                                                                             
      }, [stripe]);                                                                                                                       
                                                                                                                                          
                                                                                                                                          
      return message;                                                                                                                     
    };                                                                                                                                    
                                                                                                                                          
    export default PaymentStatus;                                                                                                         
                                                                                                                                          
  ### Collect wallet information                                                                                                          
                                                                                                                                          
  If you accept Apple Pay or Google Pay, call ]8;id=2284771266;https://docs.stripe.com/js/elements/submitelements.submit()]8;; ]8;id=2284771266;https://docs.stripe.com/js/elements/submithttps://docs.stripe.com/js/elements/submit]8;; at the beginning of your       
  submission handler. This triggers form validation and shows the native payment sheet so your customer can authorize the payment.        
                                                                                                                                          
  #### HTML + JS                                                                                                                          
                                                                                                                                          
    form.addEventListener('submit', async (event) => {                                                                                    
      event.preventDefault();                                                                                                             
                                                                                                                                          
      // Trigger form validation and wallet collection                                                                                    
      const {error: submitError} = await elements.submit();                                                                               
      if (submitError) {                                                                                                                  
        handleError(submitError);                                                                                                         
        return;                                                                                                                           
      }                                                                                                                                   
                                                                                                                                          
      // Confirm the payment                                                                                                              
    });                                                                                                                                   
                                                                                                                                          
  #### React                                                                                                                              
                                                                                                                                          
    const handleSubmit = async (event) => {                                                                                               
      event.preventDefault();                                                                                                             
                                                                                                                                          
      if (!stripe || !elements) {                                                                                                         
        // Stripe.js hasn't yet loaded.                                                                                                   
        // Make sure to disable form submission until Stripe.js has loaded.                                                               
        return;                                                                                                                           
      }                                                                                                                                   
                                                                                                                                          
      // Trigger form validation and wallet collection                                                                                    
      const {error: submitError} = await elements.submit();                                                                               
      if (submitError) {                                                                                                                  
        handleError(submitError);                                                                                                         
        return;                                                                                                                           
      }                                                                                                                                   
                                                                                                                                          
      // Confirm the payment                                                                                                              
    };                                                                                                                                    
                                                                                                                                          
  ## Redirect and authenticate transactions                                                                                               
                                                                                                                                          
  Customers can authenticate Cash App Pay transactions with mobile or desktop apps. The client the customer is using determines the       
  authentication method after calling confirmPayment.                                                                                     
                                                                                                                                          
  #### Mobile app authentication                                                                                                          
                                                                                                                                          
  After calling confirmPayment, the customers are redirected to Cash App to approve or decline the payment. After the customers authorize 
  the payment, they’re redirected to the Payment Intent’s return_url. Stripe adds payment_intent, payment_intent_client_secret,           
  redirect_pm_type, and redirect_status as URL query parameters (along with any existing query parameters in the return_url).             
                                                                                                                                          
  An authentication session expires after 60 minutes, and the PaymentIntent’s status transitions back to require_payment_method. After the
  status transitions, the customer sees a payment error and must restart the payment process.                                             
                                                                                                                                          
  #### Desktop web app authentication                                                                                                     
                                                                                                                                          
  After calling confirmPayment, a QR code displays on the webpage. Your customers can scan the QR code using either their mobile device’s 
  camera or the Cash App mobile app and authenticate the payment using Cash App Pay. A few seconds after customers authenticate the       
  payment successfully, the QR code modal closes automatically and you can fulfill the order. Stripe redirects to the return_url when     
  payment is complete. If you don’t want to redirect after payment on web, pass redirect: if_required to the Payment Element.             
                                                                                                                                          
  An authentication session expires after 60 minutes. You can refresh the QR code up to 20 times before the PaymentIntent’s status        
  transitions back to require_payment_method. After the status transitions, the customer sees a payment error and must restart the payment
  process.                                                                                                                                
                                                                                                                                          
  ## Optional: Separate authorization and capture                                                                                         
                                                                                                                                          
  You can separate authorization and capture to create a charge now, but capture funds later. Stripe cancels the PaymentIntent and sends a
  ]8;id=2829129611;https://docs.stripe.com/api/events/types.md#event_types-payment_intent.canceledpayment_]8;;]8;id=2829129611;https://docs.stripe.com/api/events/types.md#event_types-payment_intent.canceledintent.canceled]8;; ]8;id=2829129611;https://docs.stripe.com/api/events/types.md#event_types-payment_intent.canceledhttps://docs.stripe.com/api/events/types.md#event_types-payment_intent.canceled]8;; event if the payment isn’t      
  captured during the 7-day window.                                                                                                       
                                                                                                                                          
  If you know that you can’t capture the payment, we recommend ]8;id=1116213074;https://docs.stripe.com/refunds.md#cancel-paymentcanceling the PaymentIntent]8;; ]8;id=1116213074;https://docs.stripe.com/refunds.md#cancel-paymenthttps://docs.stripe.com/refunds.md#cancel-]8;;     
  ]8;id=1116213074;https://docs.stripe.com/refunds.md#cancel-paymentpayment]8;; instead of waiting for the 7-day window to elapse.                                                                              
                                                                                                                                          
  ### 1. Tell Stripe to authorize only                                                                                                    
                                                                                                                                          
  To indicate that you want separate authorization and capture, set ]8;id=4173799167;https://docs.stripe.com/api/payment_intents/create.md#create_payment_intent-capture_methodcapture_]8;;]8;id=4173799167;https://docs.stripe.com/api/payment_intents/create.md#create_payment_intent-capture_methodmethod]8;;                                                        
  ]8;id=4173799167;https://docs.stripe.com/api/payment_intents/create.md#create_payment_intent-capture_methodhttps://docs.stripe.com/api/payment_intents/create.md#create_payment_intent-capture_method]8;; to manual when creating the PaymentIntent.   
  This parameter instructs Stripe to only authorize the amount on the customer’s Cash App Pay account.                                    
                                                                                                                                          
    curl https://api.stripe.com/v1/payment_intents \                                                                                      
      -u "<<YOUR_SECRET_KEY>>:" \                                                                                                         
      -d amount=6000 \                                                                                                                    
      -d confirm=true \                                                                                                                   
      -d currency=usd \                                                                                                                   
      -d "automatic_payment_methods[enabled]=true" \                                                                                      
      -d "payment_method_data[type]=cashapp" \                                                                                            
      -d capture_method=manual \                                                                                                          
      --data-urlencode "return_url=https://www.example.com/checkout/done"                                                                 
                                                                                                                                          
  ### 2. Capture the funds                                                                                                                
                                                                                                                                          
  After the authorization succeeds, the PaymentIntent ]8;id=1303086519;https://docs.stripe.com/api/payment_intents/object.md#payment_intent_object-statusstatus]8;; ]8;id=1303086519;https://docs.stripe.com/api/payment_intents/object.md#payment_intent_object-statushttps://docs.stripe.com/api/payment_intents/object.md#payment_intent_object-]8;; 
  ]8;id=1303086519;https://docs.stripe.com/api/payment_intents/object.md#payment_intent_object-statusstatus]8;; transitions to requires_capture. To capture the authorized funds, make a PaymentIntent ]8;id=1421478179;https://docs.stripe.com/api/payment_intents/capture.mdcapture]8;;                                   
  ]8;id=1421478179;https://docs.stripe.com/api/payment_intents/capture.mdhttps://docs.stripe.com/api/payment_intents/capture.md]8;; request.                                                                         
                                                                                                                                          
    curl -X POST https://api.stripe.com/v1/payment_intents/{PAYMENT_INTENT_ID}/capture \                                                  
      -u "<<YOUR_SECRET_KEY>>:"                                                                                                           
                                                                                                                                          
  The total authorized amount is captured by default. You can also specify amount_to_capture which can be less or equal to the total.     
                                                                                                                                          
  ### (Optional) Cancel the authorization                                                                                                 
                                                                                                                                          
  If you need to cancel an authorization, you can ]8;id=3073318019;https://docs.stripe.com/api/payment_intents/cancel.mdcancel the PaymentIntent]8;; ]8;id=3073318019;https://docs.stripe.com/api/payment_intents/cancel.mdhttps://docs.stripe.com/api/payment_intents/cancel.md]8;;.         
                                                                                                                                          
  ## Optional: Handle post-payment events                                                                                                 
                                                                                                                                          
  Stripe sends a ]8;id=1823645533;https://docs.stripe.com/api/events/types.md#event_types-payment_intent.succeededpayment_]8;;]8;id=1823645533;https://docs.stripe.com/api/events/types.md#event_types-payment_intent.succeededintent.succeeded]8;; ]8;id=1823645533;https://docs.stripe.com/api/events/types.md#event_types-payment_intent.succeededhttps://docs.stripe.com/api/events/types.md#event_types-payment_intent.succeeded]8;; event when the 
  payment completes. Use the Dashboard, a custom *webhook* (A webhook is a real-time push notification sent to your application as a JSON 
  payload through HTTPS requests), or a partner solution to receive these events and run actions, like sending an order confirmation email
  to your customer, logging the sale in a database, or starting a shipping workflow.                                                      
                                                                                                                                          
  Listen for these events rather than waiting on a callback from the client. On the client, the customer could close the browser window or
  quit the app before the callback executes, and malicious clients could manipulate the response. Setting up your integration to listen   
  for asynchronous events also helps you accept more payment methods in the future. Learn about the ]8;id=1482050013;https://stripe.com/payments/payment-methods-guidedifferences between all supported]8;;     
  ]8;id=1482050013;https://stripe.com/payments/payment-methods-guidepayment methods]8;; ]8;id=1482050013;https://stripe.com/payments/payment-methods-guidehttps://stripe.com/payments/payment-methods-guide]8;;.                                                                      
                                                                                                                                          
  • **Handle events manually in the Dashboard**Use the Dashboard to ]8;id=359093100;https://dashboard.stripe.com/paymentsview your payments]8;; ]8;id=359093100;https://dashboard.stripe.com/paymentshttps://dashboard.stripe.com/payments]8;;, send email  
  receipts, handle payouts, or retry failed payments.                                                                                     
  • **Build a custom webhook**]8;id=2683111610;https://docs.stripe.com/events/set-up-events.md#create-event-handlerBuild a custom webhook handler]8;; ]8;id=2683111610;https://docs.stripe.com/events/set-up-events.md#create-event-handlerhttps://docs.stripe.com/events/set-up-events.md#create-event-handler]8;; to      
  listen for events and build custom asynchronous payment flows. Test and debug your webhook integration locally with the Stripe CLI.     
  • **Integrate a prebuilt app**Handle common business events, such as ]8;id=2509110031;https://stripe.partners/?f_category=automationautomation]8;; ]8;id=2509110031;https://stripe.partners/?f_category=automationhttps://stripe.partners/?f_category=automation]8;; or       
  ]8;id=4065552205;https://stripe.partners/?f_category=marketing-and-salesmarketing and sales]8;; ]8;id=4065552205;https://stripe.partners/?f_category=marketing-and-saleshttps://stripe.partners/?f_category=marketing-and-sales]8;;, by integrating a partner application.                      
                                                                                                                                          
  ## Test your integration                                                                                                                
                                                                                                                                          
  #### Mobile web app testing                                                                                                             
                                                                                                                                          
  To test your integration, choose Cash App Pay as the payment method and tap **Pay**. While testing, this redirects you to a test payment
  page where you can approve or decline the payment.                                                                                      
                                                                                                                                          
  In live mode, tapping **Pay** redirects you to the Cash App mobile application—you don’t have the option to approve or decline the      
  payment within Cash App. The payment is automatically approved after the redirect.                                                      
                                                                                                                                          
  #### Desktop web app testing                                                                                                            
                                                                                                                                          
  To test your integration, scan the QR code with a QR code scanning application on your mobile device. While testing, the QR code payload
  contains a URL that redirects you to a test payment page where you can approve or decline the test payment.                             
                                                                                                                                          
  In live mode, scanning the QR code redirects you to the Cash App mobile application—you don’t have the option to approve or decline the 
  payment within Cash App. The payment is automatically approved after you scan the QR code.                                              
                                                                                                                                          
  ## Failed payments                                                                                                                      
                                                                                                                                          
  Cash App Pay uses multiple data points to decide when to decline a transaction (for example, their AI model detected high consumer fraud
  risk for the transaction, or the consumer has revoked your permission to charge them in Cash App).                                      
                                                                                                                                          
  In these cases, the ]8;id=579698081;https://docs.stripe.com/api/payment_methods/object.mdPaymentMethod]8;; ]8;id=579698081;https://docs.stripe.com/api/payment_methods/object.mdhttps://docs.stripe.com/api/payment_methods/object.md]8;; is detached and the ]8;id=3978682500;https://docs.stripe.com/api/payment_intents/object.mdPaymentIntent]8;;               
  ]8;id=3978682500;https://docs.stripe.com/api/payment_intents/object.mdhttps://docs.stripe.com/api/payment_intents/object.md]8;; object’s status automatically transitions to requires_payment_method.             
                                                                                                                                          
  Other than a payment being declined, for a Cash App Pay ]8;id=3978682500;https://docs.stripe.com/api/payment_intents/object.mdPaymentIntent]8;; ]8;id=3978682500;https://docs.stripe.com/api/payment_intents/object.mdhttps://docs.stripe.com/api/payment_intents/object.md]8;; with a      
  status of requires_action, customers must complete the payment within 10 minutes after they’re redirected to Cash App. If no action is  
  taken after 10 minutes, the ]8;id=579698081;https://docs.stripe.com/api/payment_methods/object.mdPaymentMethod]8;; ]8;id=579698081;https://docs.stripe.com/api/payment_methods/object.mdhttps://docs.stripe.com/api/payment_methods/object.md]8;; is detached and the ]8;id=3978682500;https://docs.stripe.com/api/payment_intents/object.mdPaymentIntent]8;;       
  ]8;id=3978682500;https://docs.stripe.com/api/payment_intents/object.mdhttps://docs.stripe.com/api/payment_intents/object.md]8;; object’s status automatically transitions to requires_payment_method.             
                                                                                                                                          
  When this happens, the Payment Element renders error messages and instructs your customer to retry using a different payment method.    
                                                                                                                                          
  ## Error codes                                                                                                                          
                                                                                                                                          
  The following table details common error codes and recommended actions:                                                                 
                                                                                                                                          
   Error Code                                              | Recommended Action                                                           
  ---------------------------------------------------------|------------------------------------------------------------------------------
   payment_intent_invalid_currency                         | Enter the appropriate currency. Cash App Pay only supports usd.              
   missing_required_parameter                              | Check the error message for more information about the required parameter.   
   payment_intent_payment_attempt_failed                   | This code can appear in the ]8;id=1121082633;https://docs.stripe.com/api/payment_intents/object.md#payment_intent_object-last_payment_error-codelast_payment_error.code[1]]8;; field of a            
                                                           | PaymentIntent. Check the error message for a detailed failure reason and     
                                                           | suggestion on error handling.                                                
   payment_intent_redirect_confirmation_without_return_url | Provide a return_url when confirming a PaymentIntent with Cash App Pay.      
                                                                                                                                          
  [1]: last_payment_error.code ]8;id=1121082633;https://docs.stripe.com/api/payment_intents/object.md#payment_intent_object-last_payment_error-codehttps://docs.stripe.com/api/payment_intents/object.md#payment_intent_object-last_payment_error-code]8;;        

