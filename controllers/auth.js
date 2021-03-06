const crypto = require('crypto');

const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const { validationResult } = require('express-validator/check');

const User = require('../models/user');
const { getMaxListeners } = require('../models/user');

exports.getLogin = (req, res, next) => {
  let message = req.flash('error');
  if (message.length > 0) {
    message = message[0];
  } else {
    message = null;
  }
  res.render('pages/auth/login', {
    path: '/login',
    title: 'ASKAS | Login',
    errorMessage: message,
    oldInput: {
      email: '',
      password: ''
    },
    validationErrors: []
  });
};

exports.getSignup = (req, res, next) => {
  let message = req.flash('error');
  if (message.length > 0) {
    message = message[0];
  } else {
    message = null;
  }
  res.render('pages/auth/signup', {
    path: '/signup',
    title: 'ASKAS | Signup',
    errorMessage: message,
    oldInput: {
      email: '',
      password: '',
      confirmPassword: ''
    },
    validationErrors: []
  });
};

exports.postLogin = (req, res, next) => {
  const email = req.body.email;
  const password = req.body.password;

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).render('pages/auth/login', {
      path: '/login',
      title: 'ASKAS | Login',
      errorMessage: errors.array()[0].msg,
      oldInput: {
        email: email,
        password: password
      },
      validationErrors: errors.array()
    });
  }

  User.findOne({ email: email })
    .then(user => {
      if (!user) {
        return res.status(422).render('pages/auth/login', {
          path: '/login',
          title: 'ASKAS | Login',
          errorMessage: 'No account with this email. Please sign up',
          oldInput: {
            email: email,
            password: password
          },
          validationErrors: []
        });
      }
      bcrypt
        .compare(password, user.password)
        .then(doMatch => {
          if (doMatch) {
            req.session.isLoggedIn = true;
            req.session.user = user;
            return req.session.save(err => {
              console.log(err);
              if(user.role === 'admin') {
                res.redirect('/admin/dashboard');
              } else {
                res.redirect('/askas/dashboard');}
            });
          }
          return res.status(422).render('pages/auth/login', {
            path: '/login',
            title: 'ASKAS | Login',
            errorMessage: 'Invalid email or password.',
            oldInput: {
              email: email,
              password: password
            },
            validationErrors: []
          });
        })
        .catch(err => {
          console.log(err);
          res.redirect('/login');
        });
    })
    .catch(err => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.postSignup = (req, res, next) => {
  const { firstName, lastName } = req.body;
  const email = req.body.email;
  const password = req.body.password;
  const roleNumber = req.body.roleNumber;
  let role;

  //Logic to set roles
  if (roleNumber === 'trust') {
    role = 'admin';
  } else {
    role = 'member';
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log(errors.array());
    return res.status(422).render('pages/auth/signup', {
      path: '/signup',
      title: 'ASKAS | Signup',
      errorMessage: errors.array()[0].msg,
      oldInput: {
        firstName: firstName,
        lastName: lastName,
        email: email,
        password: password,
        confirmPassword: req.body.confirmPassword
      },
      validationErrors: errors.array()
    });
  }
  bcrypt
    .hash(password, 12)
    .then(hashedPassword => {
      const user = new User({
        firstName: firstName,
        lastName: lastName,
        name: firstName + ' ' + lastName,
        email: email,
        password: hashedPassword,
        role: role,
        status: "active",
        bucket: { items: [] }
      });
      return user.save();
    })
    .then(result => {
      res.redirect('login');

      const mailOptions = {
        from: 'byuiaudio@gmail.com',
        to: email,
        subject: 'Signup succeeded!',
        html: `
            <h1>Hurray!!!</h1> <br><h2>You successfully signed up. Congratulations!</h2>
            <p>Now, go ahead and get used to the website to record your hours. Have fun!!</p>
          `
      };
      return transporter.sendMail(mailOptions, function (error, info) {
        if (error) {
          console.log(error);
        } else {
          console.log('Email sent: ' + info.response);
        }
      });
    })
    .catch(err => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.postLogout = (req, res, next) => {
  req.session.destroy(err => {
    console.log(err);
    res.redirect('/');
  });
};

exports.getReset = (req, res, next) => {
  let message = req.flash('error');
  if (message.length > 0) {
    message = message[0];
  } else {
    message = null;
  }
  res.render('pages/auth/reset', {
    path: '/reset',
    title: 'ASKAS | Reset Password',
    errorMessage: message
  });
};

exports.postReset = (req, res, next) => {
  crypto.randomBytes(32, (err, buffer) => {
    if (err) {
      // console.log(err);
      return res.redirect('reset');
    }
    const token = buffer.toString('hex');
    User.findOne({ email: req.body.email })
      .then(user => {
        if (!user) {
          req.flash('error', 'No account with that email found.');
          return res.redirect('reset');
        }
        user.resetToken = token;
        user.resetTokenExpiration = Date.now() + 3600000;
        return user.save();
      })
      .then(result => {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: "byuiaskas@gmail.com",
            pass: "sweetcarp"
            // user: process.env.MAIL_USERNAME,
            // pass: process.env.MAIL_PASSWORD
          }
        });

        const mailOptions = {
        from: 'byuiaskas@gmail.com',
        to: req.body.email,
        subject: 'ASKAS Password Reset!',
        html: `
            <h5>Hello, you requested a password reset</h5>
            <p>Click this <a href="https://byuibroadcastaudio.herokuapp.com/auth/reset/${token}">link</a> to set a new password.</p>
            <p>PS: This link is only valid for an hour</p>
          `
        };
        transporter.sendMail(mailOptions, (error, info) => {
          if (error) {
            console.log('Email error: ', error);
          } else {
            console.log('Email sent: ' + info.response);
          }
        });
        res.redirect('/');
      })
      .catch(err => {
        const error = new Error(err);
        error.httpStatusCode = 500;
        return next(error);
      });
  });
};

exports.getNewPassword = (req, res, next) => {
  const token = req.params.token;
  User.findOne({ resetToken: token, resetTokenExpiration: { $gt: Date.now() } })
    .then(user => {
      let message = req.flash('error');
      if (message.length > 0) {
        message = message[0];
      } else {
        message = null;
      }
      res.render('pages/auth/new-password', {
        path: '/new-password',
        title: 'ASKAS | New Password',
        errorMessage: message,
        userId: user._id.toString(),
        passwordToken: token
      });
    })
    .catch(err => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.postNewPassword = (req, res, next) => {
  const newPassword = req.body.password;
  const userId = req.body.userId;
  const passwordToken = req.body.passwordToken;
  let resetUser;

  User.findOne({
    resetToken: passwordToken,
    resetTokenExpiration: { $gt: Date.now() },
    _id: userId
  })
    .then(user => {
      resetUser = user;
      return bcrypt.hash(newPassword, 12);
    })
    .then(hashedPassword => {
      resetUser.password = hashedPassword;
      resetUser.resetToken = undefined;
      resetUser.resetTokenExpiration = undefined;
      return resetUser.save();
    })
    .then(result => {
      res.redirect('login');
    })
    .catch(err => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};