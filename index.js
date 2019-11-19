import $ from 'jquery'
window.$ = window.jQuery = $

import S3 from 'aws-sdk/clients/s3'

const options = {
  bucket: 'ulg-qc',
  prefix: '/',
  authentication: false,
}

async function* listAllObjectsFromS3Bucket(s3, bucket, prefix, delimeter) {
  let isTruncated = true
  let marker

  while(isTruncated) {
    let params = { Bucket: bucket }
    if (prefix) params.Prefix = prefix
    if (marker) params.Marker = marker
    if (delimeter) params.Delimiter = delimeter
    try {
      const response =
        options.authentication ?
          await s3.listObjects(params).promise() :
          await s3.makeUnauthenticatedRequest('listObjects', params).promise()

      if (delimeter) {
        if (response.CommonPrefixes) {
          yield* response.CommonPrefixes
        }
      } else {
        if (response.Contents) {
          yield* response.Contents
        }
      }
      isTruncated = response.IsTruncated
      if (isTruncated) {
        marker = response.Contents.slice(-1)[0].Key
      }
    } catch(error) {
      throw error
    }
  }
}

async function loadSubject(s3, subject) {
  const objs = listAllObjectsFromS3Bucket(s3, 'ulg-qc', subject + '/qc/')
  const images = {}
  for await (const obj of objs) {
    let [, , derivative, ...rest] = obj.Key.split('/')
    rest = rest.slice(0, -1)

    if (!images[derivative]) {
      images[derivative] = []
    }

    let order = []
    const identifier = Object.fromEntries(
      rest
        .filter((r) => {
          const [, key, ...value] = r.split('_')
          return key !== 'montage'
        })
        .map((r) => {
          const [, key, ...value] = r.split('_')
          order.push(key)
          return [key, value.join('_')]
        })
    )
    identifier.image = obj.Key
    images[derivative].push(identifier)
    images[derivative].order = order
  }
  return images
}

function loadImages(s3, derivative) {
  const currentValues = filters()
  const filteredImages = derivative.filter((image) =>
    derivative.order.every((field) => image[field] === currentValues[field])
  ).map((image) => image.image)
  $('#images img').remove()
  filteredImages.map(img => {
    if (options.authentication) {
      var params = {Bucket: options.bucket, Key: img}
      var url = s3.getSignedUrl('getObject', params)
      $('#images').append($('<img />').attr('src', url).on('load', function(){ $('#loading').hide() }))
    } else {
      $('#images').append(
        $('<img />')
          .attr('src', 'https://' + options.bucket + '.s3.amazonaws.com/' + img)
          .on('load', function(){ $('#loading').hide() })
      )
    }
  })
}

function filters() {
  return Object.fromEntries($('#filter div:not(.fixed) select').toArray().map((f) => { return [f.id, f.value] }))
}


async function init() {

  const s3 = new S3({
    ...(
      options.authentication ? {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      } : {}
    )
  })

  $('#loading').show()
  const subjects = listAllObjectsFromS3Bucket(s3, options.bucket, false, options.prefix)

  $('#filter select#subject option').remove()
  for await (const prefix of subjects) {
    const subject = prefix.Prefix.slice(0, -1)
    $('#filter select#subject').append($('<option />').attr('value', subject).html(subject))
  }

  $('#filter select#subject').off('change').on('change', async () => {

    $('#loading').show()

    const subject = $('#filter select#subject').val()
    const images = await loadSubject(s3, subject)

    $('#filter select#derivative option').remove()
    for (let derivative of Object.keys(images)) {
      $('#filter select#derivative').append($('<option />').attr('value', derivative).html(derivative))
    }

    $('#filter select#derivative').off('change').on('change', () => {

      $('#loading').show()
      const derivative = $('#filter select#derivative').val()

      options.filters = {
        ...filters(),
        subject,
        derivative
      }
  
      $('#filter div:not(.fixed)').remove()

      if (!derivative) {
        return
      }

      for (let field of images[derivative].order) {
        const values = [...new Set(images[derivative].map((d) => d[field]))]
        const sel = $('<select />').attr('id', field)
        values.map((v) => sel.append($('<option />').attr('value', v).html(v)))
        $('#filter').append($('<div />').attr('data-name', field).append(sel))
      }
    
      $('#filter div:not(.fixed) select').off('change').on('change', () => {
        $('#loading').show()
        options.filters = {
          ...filters(),
          subject,
          derivative
        }
        loadImages(s3, images[derivative])
      })

      if (options.filters) {
        for (let id of Object.keys(options.filters)) {
          if (id === 'subject') {
            continue
          }
          if (id === 'derivative') {
            continue
          }
          $('#filter select#' + id).val(options.filters[id])
        }
      }

      loadImages(s3, images[derivative])
    })

    if (options.filters) {
      for (let id of Object.keys(options.filters)) {
        if (id === 'subject') {
          continue
        }
        $('#filter select#' + id).val(options.filters[id])
      }
    }

    $('#filter select#derivative').change()

  }).change()
}

$(document).ready(() => {
  if (options.authentication) {
    $('#aws button').click(() => {
      options.accessKeyId = $('#aws #accessKeyId').val().trim()
      options.secretAccessKey = $('#aws #secretAccessKey').val().trim()
      $('#aws').hide()
      init().catch((error) => $('#aws').show())
    })

    $('#aws').show()

    $('#logout').click(() => {
      options = {}
      $('#aws #accessKeyId').val('')
      $('#aws #secretAccessKey').val('')
      $('#aws').show()
    })
  } else {
    init()
  }
})