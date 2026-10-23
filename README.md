# Relief Society tools

## Meal sign-up → [`reliefsociety-meals/`](reliefsociety-meals/)

A Google Apps Script that creates a meal sign-up form and a shared
schedule for someone in the ward who needs meals. It runs entirely in
your own Google account, with nothing to install.

**[Setup instructions →](reliefsociety-meals/README.md)**

## Missionary meal sign-up → [`missionary-meals/`](missionary-meals/)

A Google Apps Script that creates a sign-up form for feeding the
missionaries, one family per day, and a read-only calendar showing who
has signed up. Each person gets a confirmation email with a calendar
invite. The form pauses on Sundays so online sign-ups don't clash with
the paper sheet at church. Like the meal sign-up, it runs entirely in
your own Google account, with nothing to install.

**[Setup instructions →](missionary-meals/missionary-meal-signup.gs)**
(in the comment at the top of the script) ·
**[Changing the script safely →](missionary-meals/DEPLOY.md)** ·
**[Architecture diagram →](missionary-meals/docs/architecture.html)**

## Relief Society bulletin → [`reliefsociety-bulletin/`](reliefsociety-bulletin/)

Publishes the weekly bulletin as a web page. The bulletin's author
emails the bulletin file to the ward's bulletin address, and it appears
on the website within a few minutes. Only approved senders can publish, and
the admin is emailed about anything rejected. Unlike the other two, it
runs on Amazon Web Services and needs an AWS account, a domain name,
and some comfort with the command line to set up.

**[Setup instructions →](reliefsociety-bulletin/README.md)**

---

Each project has its own tests, which GitHub runs on every pull
request.

Licensed under the [MIT License](LICENSE).
