<p align="center">
  <img src="https://github.com/user-attachments/assets/6bc8d003-c66f-4471-a570-d2f71ec8d4d6" width="600" />
</p>

Traydner is a full-stack trading practice platform that helps users learn and test trading strategies across stocks, crypto, and forex in a risk-free environment. It combines real-time market data, simulated trades, and performance tracking with a modern web interface and a FastAPI-based backend, enabling users to analyze decisions, iterate on strategies, and build trading confidence without real financial exposure.

Users begin with $100,000 in simulated cash and can trade across stocks, cryptocurrencies, and forex markets using real-time pricing data. Through the Traydner web interface, users place paper trades, track portfolio performance, and refine strategies over time. For advanced workflows, Traydner also provides a personal API key, allowing users to programmatically execute simulated trades directly against their own paper wallet making it easy to test automated strategies and algorithmic trading systems in a safe, controlled environment.

- [Preview](https://www.traydner.com/)

# Complete Frontend Overview

## Pre-login
Before logging in, these are the pages available to the user.
### Landing Page
The landing page simply allows for a quick introduction of Traydner and access to the other pre-login pages.

![Home Page GIF-1](https://github.com/user-attachments/assets/a6594270-b56d-4f40-b686-ea9ce2b90d49)


### How It Works
The "How It Works" page explains how Traydner works and elaborates on the details mentioned in the landing page. This is primarily intended to explain that Traydner is risk-free and operates with real-time histories and a paper wallet with no advertisements to any newcomers.

![Home Page GIF-2](https://github.com/user-attachments/assets/1c383f2e-92d4-4c74-a765-b23670971217)


### Create Account
New users can create an account here. An account is required in order to trade and access the API. New users can create an account with an email and password or quickly sign in using Google. The latter accesses the information from the Google account to create an account with just as much information as the email and password option.

![Home Page GIF-4](https://github.com/user-attachments/assets/e160fd22-ecb7-4911-9434-14283fd6f5df)


### Log In
Returning users can log back in to their accounts in order to access their personal account and paper wallet. They can also log in with Google if they created their account through Google sign-in as well.

![Home Page GIF-3](https://github.com/user-attachments/assets/4e649bc3-d90f-4d6c-bb6f-6d97d1ded750)

## Post-Login

### Home Page
The home page is simply intended to allow for easy access to the main pages that a user would probably want to access.

![Home Page GIF-1](https://github.com/user-attachments/assets/b515fee9-b3da-4bfa-9bea-21e97cf341a5)

### Profile
Currently, users can only view their account information and log out through the profile page. In the future, users will be able to change account information here.

<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/7fe20b00-3b8e-4441-b28b-8d00e3fb37cc" />

### Wallet
Users can view their current holdings here. All cash, stock shares, crypto holdings, and forex holdings can be seen here.
<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/2026609e-1984-4e41-ba68-689cedb8a416" />

### Stock Trading
This is the main page for users to trade stocks through their paper wallets. There are dozens of stock symbols available to be traded on Traydner. Trades can only be made when the markets are open (9:30am - 4:00pm EST weekdays) and prices/histories consistently update throughout the day and keep up real-time price changes. Users are able to view price histories in increments from 1 minute up to 1 week, forming visible timespans of up to 5 years. The dynamic charts display the details of these price histories and the statuses of the market.

<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/036fb89a-a7e8-4079-abb8-f5f4d4517bf4" />

### Crypto Trading
This is the main page for users to trade cryptocurrencies through their paper wallets. There are many crypto symbols available to be traded on Traydner. Trades can always be made on crypto since crypto markets are open 24/7 and prices/histories consistently update throughout the day and keep up real-time price changes. Users are able to view price histories in increments from 1 minute up to 1 week, forming visible timespans of up to 5 years. The dynamic charts display the details of these price histories.


![Home Page GIF-4](https://github.com/user-attachments/assets/9948efa6-a908-4150-a372-d46560a7168e)

### Forex Trading
This is the main page for users to trade stocks through their paper wallets. There are dozens of stock symbols available to be traded on Traydner. Trades can only be made when the markets are open (7:00pm Sun - 5:30am Fri EST) and prices/histories consistently update throughout the day and keep up real-time price changes. Users are able to view price histories in increments from 1 minute up to 1 week, forming visible timespans of up to 5 years. The dynamic charts display the details of these price histories and the statuses of the market.


![Home Page GIF-5](https://github.com/user-attachments/assets/4c864667-80bd-4a9a-a4a5-ba20586c4649)

### API Key Management
Users can manage their API keys here. Full API keys that include the secret key can only be viewed upon creation, but details including the general key can be viewed at any other time.

<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/e87dccfb-3b77-4389-8a87-ef6b3ca6b4e3" />

### API Documentation
The API documentation page details every available endpoint, request parameter, response format, and authentication requirement available with Traydner. This includes price histories, market statuses, symbol prices, balance details, and trades. It also details how to set up access to their account with their API key using both JavaScript as well as Python.

<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/a4e901d3-febf-4241-b486-bceecf90686d" />

